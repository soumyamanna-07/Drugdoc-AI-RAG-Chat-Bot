"""Retrieval: query -> top-K chunks from LanceDB, filtered by drug,
re-ranked with a small bonus for chunks from the sections the user asked about."""
import re                                       # regular expressions: used to pull words out of section titles
from typing import Optional                     # Optional[X] marks an argument that may be X or None

from backend.rag import config                  # central settings (TOP_K and thresholds live there, not here)
from backend.rag.schemas import Chunk, RetrievedChunk   # the data contracts: a chunk, and a chunk plus its score
from backend.rag.vector_store import get_table, hybrid_search  # DB access; retrieval never touches LanceDB directly

SECTION_BOOST = 0.15  # ranking bonus only; the stored score stays the raw similarity
                                                # 0.15 is enough to promote the right section, small enough that
                                                # an irrelevant chunk cannot win on the bonus alone
_STOPWORDS = {"and", "or", "of", "the", "for", "to", "in", "with", "use"}
                                                # filler words ignored when comparing section titles, so
                                                # "Dosage and Administration" is compared on "dosage"/"administration"


def _tokens(text: str) -> set[str]:             # helper (leading _ = internal); turns a title into comparable words
    """Meaningful words, lowercased, numbers/symbols removed, simple plural -> singular.
    '6 ADVERSE REACTIONS' -> {'adverse', 'reaction'}"""
    words = re.findall(r"[a-z]+", text.lower())  # lowercase, then keep only letter runs: numbers and symbols vanish
    return {w[:-1] if w.endswith("s") and len(w) > 4 else w   # drop a trailing "s" (reactions -> reaction);
            for w in words if w not in _STOPWORDS}            # len > 4 guard avoids mangling short words; set = order-free


def section_matches(section: str, wanted: list[str]) -> bool:  # does this chunk's section match what the user asked about?
    """True if the chunk's section shares a meaningful word with any wanted section.
    Works for 'Adverse Reactions', '6 ADVERSE REACTIONS', 'WARNING: LACTIC ACIDOSIS'..."""
    sec = _tokens(section)                       # the chunk's section as a word set
    return any(_tokens(w) & sec for w in wanted) # "&" is set intersection: True if ANY wanted section shares a word


def retrieve(query: str, drug_names: Optional[list[str]] = None,   # the question; which drugs to restrict to
             top_k: int = config.TOP_K,                            # how many chunks to return (default from config)
             sections: Optional[list[str]] = None,                 # sections to boost, from query understanding
             preferred_audience: str | None = None) -> list[RetrievedChunk]:  # "patient"/"clinician" content preference
    table = get_table()                          # the LanceDB table holding all ingested chunks
    if table is None or table.count_rows() == 0: # nothing ingested yet
        return []                                # fail safe: empty result -> the relevance gate escalates, no crash

    n = min(max(top_k * 3, 10), table.count_rows()) if sections else top_k
                                                 # when re-ranking, fetch a BIGGER pool (3x, at least 10) so a good
                                                 # chunk at rank 6 can be promoted; never ask for more rows than exist
    rows = hybrid_search(query, drug_names=drug_names, limit=n)
                                                 # vector similarity + keyword (BM25) search, filtered by drug name;
                                                 # keyword search is what catches exact terms like "500 mg"

    results = []                                 # will hold validated RetrievedChunk objects
    for row in rows:                             # each row is a raw dict from the database
        score = row.get("_retrieval_score", 0.0) # similarity score; .get() defaults to 0.0 if the column is missing
        fields = {k: v for k, v in row.items()   # copy the row, but...
              if k not in ("vector", "_distance", "_score", "_hybrid_score",
                       "_retrieval_score", "_fts_rank")}
                                                 # ...drop internal DB columns; Chunk() rejects unknown fields
        preferred_bonus = 0.04 if preferred_audience and fields.get("audience") == preferred_audience \
            and fields.get("source") == "brand_site" else 0.0
                                                 # tiny nudge only when ALL hold: an audience was requested, the chunk
                                                 # targets it, and it came from a brand site (patient-friendly wording)
        results.append(RetrievedChunk(chunk=Chunk(**fields), score=round(score + preferred_bonus, 3)))
                                                 # **fields unpacks the dict into Chunk, which validates the data;
                                                 # round(...,3) keeps scores readable in logs and the UI

    if sections:
        results.sort(key=lambda r: r.score + (SECTION_BOOST if section_matches(r.chunk.section, sections) else 0),
                     reverse=True)                # KEY POINT: the boost lives only in the sort key, never in r.score,
                                                  # so the relevance gate still sees the true similarity; reverse=True
                                                  # means highest first
    elif preferred_audience:
        results.sort(key=lambda r: r.score, reverse=True)   # audience bonus is already inside the score, so plain sort
    return results[:top_k]                        # trim the enlarged pool back to the requested number


if __name__ == "__main__":                        # runs ONLY when executed directly, never on import: self-test
    print("Section matching with real-label naming styles:")
    cases = [                                     # (section as a real label writes it, wanted sections, expected result)
        ("6 ADVERSE REACTIONS", ["Adverse Reactions"], True),          # numbered heading must still match
        ("2 DOSAGE & ADMINISTRATION", ["Dosage and Administration"], True),  # "&" instead of "and"
        ("WARNING: LACTIC ACIDOSIS", ["Boxed Warning", "Warnings and Precautions"], True),  # boxed warning wording
        ("5 WARNINGS AND PRECAUTIONS", ["Boxed Warning", "Warnings and Precautions"], True),
        ("4 CONTRAINDICATIONS", ["Indications and Usage"], False),     # must NOT confuse these two opposites
        ("1 INDICATIONS AND USAGE", ["Contraindications"], False),     # the reverse direction of the same trap
    ]
    for section, wanted, expected in cases:
        got = section_matches(section, wanted)    # run the matcher
        print(f"  {'PASS' if got == expected else 'FAIL'}  {section:<28} vs {wanted} -> {got}")
                                                  # PASS/FAIL line; :<28 pads for a readable column

    tests = [                                     # end-to-end retrieval checks (need data in the table)
        ("What is the maximum daily dose of metformin?", ["metformin"], ["Dosage and Administration"]),
        ("What are the side effects?", ["metformin"], ["Adverse Reactions"]),   # follow-up style, drug supplied
        ("What is the dose for severe infections?", None, None),                # no filter, no boost: baseline
    ]
    for q, drugs, secs in tests:
        print(f"\nQ: {q}   (filter: {drugs}, sections: {secs})")
        for r in retrieve(q, drugs, top_k=3, sections=secs):   # call the real function
            print(f"  {r.score:.3f}  {r.chunk.chunk_id:<11} {r.chunk.section}")
                                                  # score, chunk id and section: the right chunk should be on top