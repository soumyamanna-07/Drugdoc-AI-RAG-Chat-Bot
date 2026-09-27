import pytest
import os
import fitz
from lxml import etree

@pytest.fixture(scope="session")
def test_pdf_path(tmp_path_factory):
    fn = tmp_path_factory.mktemp("data") / "test.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "TEST DATA - NOT MEDICAL ADVICE.\nThis is a test pdf for drug documentation.")
    doc.save(str(fn))
    return str(fn)

@pytest.fixture(scope="session")
def test_xml_path(tmp_path_factory):
    fn = tmp_path_factory.mktemp("data") / "test.xml"
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="urn:hl7-org:v3">
    <id root="test-id-123"/>
    <setId root="set-id-456"/>
    <versionNumber value="2"/>
    <effectiveTime value="2026-09-18"/>
    <manufacturedProduct>
        <name>Test Drug</name>
    </manufacturedProduct>
    <activeIngredient>
        <name>Active Ingredient X</name>
    </activeIngredient>
    <telecom value="http://dailymed.example.com/test"/>
    <component>
        <structuredBody>
            <component>
                <section>
                    <title>Indications and Usage</title>
                    <text>TEST DATA - NOT MEDICAL ADVICE. Use for testing.</text>
                </section>
            </component>
        </structuredBody>
    </component>
</document>
"""
    with open(fn, 'w') as f:
        f.write(xml_content)
    return str(fn)
