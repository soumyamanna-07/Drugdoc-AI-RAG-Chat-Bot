from lxml import etree
from backend.app.models import Page, ParsedDocument, DocumentMetadata, Section
import datetime
import os

class XMLParser:
    def __init__(self):
        # Common namespaces in SPL XML
        self.ns = {
            'v3': 'urn:hl7-org:v3'
        }

    def parse(self, file_path: str, doc_id: str = None, drug_name: str = None) -> ParsedDocument:
        tree = etree.parse(file_path)
        root = tree.getroot()
        
        # Try to extract metadata if not provided
        if not doc_id:
            id_elem = root.find('.//v3:id', namespaces=self.ns)
            doc_id = id_elem.get('root') if id_elem is not None else "unknown_id"
            
        set_id_elem = root.find('.//v3:setId', namespaces=self.ns)
        set_id = set_id_elem.get('root') if set_id_elem is not None else "unknown"
            
        if not drug_name:
            name_elem = root.find('.//v3:manufacturedProduct//v3:name', namespaces=self.ns)
            drug_name = name_elem.text if name_elem is not None else "Unknown Drug"
            
        active_ing_elem = root.find('.//v3:activeIngredient//v3:name', namespaces=self.ns)
        active_ingredient = active_ing_elem.text if active_ing_elem is not None else "unknown"
            
        version_elem = root.find('.//v3:versionNumber', namespaces=self.ns)
        version = version_elem.get('value') if version_elem is not None else "unknown"
        
        effective_time_elem = root.find('.//v3:effectiveTime', namespaces=self.ns)
        effective_date = effective_time_elem.get('value') if effective_time_elem is not None else "unknown"
        
        # Determine source url if available in the XML, otherwise use filename
        source_url_elem = root.find('.//v3:telecom', namespaces=self.ns)
        source_url = source_url_elem.get('value') if source_url_elem is not None else os.path.basename(file_path)
        
        metadata = DocumentMetadata(
            document_id=doc_id,
            set_id=set_id,
            drug_name=drug_name,
            active_ingredient=active_ingredient,
            label_version=version,
            effective_date=effective_date,
            ingestion_timestamp=datetime.datetime.utcnow().isoformat(),
            source_file=os.path.basename(file_path),
            source_type="xml",
            source_identifier=source_url
        )
        
        sections = self._extract_sections(root)
        
        # XML doesn't have page numbers naturally. We'll map the whole document to page 1 for compatibility.
        full_text = "\n\n".join([s.title + "\n" + s.text for s in sections])
        pages = [Page(page_number=1, text=full_text, extraction_method="xml_text")]
        
        return ParsedDocument(metadata=metadata, pages=pages, sections=sections)

    def _extract_sections(self, root) -> list[Section]:
        sections = []
        for component in root.findall('.//v3:component/v3:section', namespaces=self.ns):
            title_elem = component.find('v3:title', namespaces=self.ns)
            code_elem = component.find('v3:code', namespaces=self.ns)
            text_elems = component.findall('.//v3:text', namespaces=self.ns)
            
            if text_elems:
                title = None
                if title_elem is not None and title_elem.text and title_elem.text.strip():
                    title = title_elem.text.strip()
                elif code_elem is not None and code_elem.get('displayName'):
                    title = code_elem.get('displayName').strip()
                else:
                    title = "Unknown Section"
                
                texts = []
                for t in text_elems:
                    # extract text with lxml, preserving some structure or just flat string
                    texts.append("".join(t.itertext()).strip())
                    
                full_text = "\n".join(texts)
                if full_text:
                    sections.append(Section(title=title, text=full_text))
                    
        return sections
