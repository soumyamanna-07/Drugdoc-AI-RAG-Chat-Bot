"""Sample chunks for testing until real ingested labels are available."""
from backend.rag.schemas import Chunk

SAMPLE_CHUNKS = [
    Chunk(chunk_id="met-ind-1", drug_name="metformin", section="Indications and Usage",
          source_file="metformin_label.pdf", page=1,
          text="Metformin is indicated as an adjunct to diet and exercise to improve "
               "glycemic control in adults and pediatric patients 10 years and older "
               "with type 2 diabetes mellitus."),
    Chunk(chunk_id="met-dose-1", drug_name="metformin", section="Dosage and Administration",
          source_file="metformin_label.pdf", page=4,
          text="Adults: start with 500 mg orally twice a day or 850 mg once a day, "
               "given with meals. Increase in 500 mg weekly steps or 850 mg every two "
               "weeks based on glycemic control and tolerability. Maximum recommended "
               "dose is 2550 mg per day."),
    Chunk(chunk_id="met-ci-1", drug_name="metformin", section="Contraindications",
          source_file="metformin_label.pdf", page=5,
          text="Metformin is contraindicated in patients with severe renal impairment "
               "(eGFR below 30 mL/min/1.73 m2), hypersensitivity to metformin, and acute "
               "or chronic metabolic acidosis, including diabetic ketoacidosis."),
    Chunk(chunk_id="met-bw-1", drug_name="metformin", section="Boxed Warning",
          source_file="metformin_label.pdf", page=1,
          text="Postmarketing cases of metformin-associated lactic acidosis have "
               "resulted in death, hypothermia, hypotension, and bradyarrhythmias. "
               "Risk factors include renal impairment, age 65 or older, radiological "
               "studies with contrast, surgery, hypoxic states, and excessive alcohol."),
    Chunk(chunk_id="met-ar-1", drug_name="metformin", section="Adverse Reactions",
          source_file="metformin_label.pdf", page=8,
          text="The most common adverse reactions (over 5 percent) are diarrhea, "
               "nausea, vomiting, flatulence, asthenia, indigestion, abdominal "
               "discomfort, and headache."),
    Chunk(chunk_id="amx-ind-1", drug_name="amoxicillin", section="Indications and Usage",
          source_file="amoxicillin_label.pdf", page=1,
          text="Amoxicillin is a penicillin-class antibacterial indicated for infections "
               "of the ear, nose, throat, genitourinary tract, skin, and lower "
               "respiratory tract caused by susceptible bacteria."),
    Chunk(chunk_id="amx-dose-1", drug_name="amoxicillin", section="Dosage and Administration",
          source_file="amoxicillin_label.pdf", page=3,
          text="Adults with mild to moderate infections of the ear, nose, throat, skin, "
               "or genitourinary tract: 500 mg every 12 hours or 250 mg every 8 hours. "
               "Severe infections: 875 mg every 12 hours or 500 mg every 8 hours."),
    Chunk(chunk_id="amx-ci-1", drug_name="amoxicillin", section="Contraindications",
          source_file="amoxicillin_label.pdf", page=4,
          text="Amoxicillin is contraindicated in patients with a history of serious "
               "hypersensitivity reactions, such as anaphylaxis or Stevens-Johnson "
               "syndrome, to amoxicillin or other beta-lactam antibacterials."),
]

if __name__ == "__main__":
    print(f"{len(SAMPLE_CHUNKS)} sample chunks")
    for c in SAMPLE_CHUNKS:
        print(f"  {c.chunk_id:<11} {c.drug_name:<12} {c.section}")
