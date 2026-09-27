"""Citation engine: map [n] markers to document/section/page, drop fake citations,
auto-cite sentences clearly supported by one excerpt, verify numbers and high-risk topics
against the cited sources, renumber in order of appearance, and measure coverage."""
import re                                        # all the text analysis here is regex-based

from pydantic import BaseModel, Field            # validated result object; Field gives safe default lists

from backend.rag.schemas import Citation, RetrievedChunk   # the citation contract and the scored chunks

_MARKER = re.compile(r"\[(\d+(?:\s*,\s*\d+)*|FAERS)\]", re.IGNORECASE)
                                                 # finds [1], [1,3], [1, 3] or [FAERS]; IGNORECASE so [faers] works
_TRAILING = re.compile(r"([.!?])[ \t]*((?:(?:\[\d+(?:\s*,\s*\d+)*\]|\[FAERS\])[ \t]*)+)", re.IGNORECASE)
                                                 # finds a citation written AFTER the full stop: "day. [1]"
_NUMBER = re.compile(r"\d+(?:\.\d+)?")           # any number, whole or decimal (2550, 1.73)
_SKIP_PHRASES = ("talk to your doctor", "talk to your pharmacist", "doctor or pharmacist")
                                                 # the safety disclaimer isn't a fact, so it never needs a citation
_STOPWORDS = {"with", "that", "this", "from", "have", "should", "would", "could", "their",
              "there", "which", "about", "what", "when", "your", "into", "also", "been",
              "were", "they", "them", "does", "than", "then", "only", "more", "most",
              "some", "such", "other", "according", "excerpts", "excerpt"}
                                                 # common words excluded when measuring sentence-to-excerpt overlap,
                                                 # otherwise every sentence would look similar to every excerpt
MIN_OVERLAP = 0.6   # share of a sentence's key words that must appear in one excerpt
                                                 # 0.6 is deliberately strict: auto-citation must not rescue a
                                                 # sentence the excerpt only loosely resembles

# High-risk topics: if the question or answer mentions one, the cited excerpts must too.
# Each topic lists patient words AND label words, so "kidney" is satisfied by "renal".
HIGH_RISK_TOPICS = {                             # this dict is the hallucination catch that found the pregnancy bug
    "pregnancy": [r"pregnan", r"fetus", r"fetal"],        # "pregnan" covers pregnant/pregnancy in one pattern
    "breastfeeding": [r"breast.?feed", r"lactat", r"nursing", r"breast milk"],
                                                 # .? matches "breastfeed" and "breast-feed"
    "children": [r"child", r"kids?\b", r"pediatric", r"paediatric", r"infant", r"adolescent",
                 r"newborn"],                    # patient word "kids" and label word "pediatric" both count
    "older adults": [r"elderly", r"geriatric", r"older adult", r"65 or older", r"aged? 65"],
    "kidney": [r"kidney", r"renal", r"egfr", r"creatinine"],   # "kidney" question vs "renal" label: the key case
    "liver": [r"liver", r"hepatic"],
    "alcohol": [r"alcohol", r"drinking"],
    "heart": [r"heart\b", r"cardiac", r"cardiovascular"],      # \b stops "heartburn" matching "heart"
    "surgery": [r"surgery", r"surgical"],
    "contrast imaging": [r"contrast", r"radiolog"],
}


class CitationResult(BaseModel):                 # everything the pipeline needs to decide approve vs escalate
    text: str                                   # answer with renumbered markers
    citations: list[Citation] = Field(default_factory=list)   # default_factory gives each result its own new list
    invalid_refs: list[int] = Field(default_factory=list)   # cited numbers with no excerpt
    coverage: float = 0.0                       # share of factual sentences with a citation
    uncited: list[str] = Field(default_factory=list)
    auto_cited: list[str] = Field(default_factory=list)     # sentences the engine cited itself
    unsupported_numbers: list[str] = Field(default_factory=list)  # numbers not in cited source
    ungrounded_topics: list[str] = Field(default_factory=list)    # high-risk topics not in sources


def _normalize(text: str) -> str:
    """Move citations written after the full stop to before it: 'day. [1]' -> 'day [1].'"""
    return _TRAILING.sub(lambda m: " " + m.group(2).strip() + m.group(1), text)
                                                 # group(1) is the punctuation, group(2) the markers; they're
                                                 # swapped so sentence splitting keeps the citation attached.
                                                 # Without this, correct answers were wrongly escalated.


def _numbers(text: str) -> set[str]:
    text = _MARKER.sub("", text)                 # strip [1] first, or the citation number counts as a fact
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", "", text)          # 2,550 -> 2550
                                                 # lookbehind/lookahead: removes only thousands separators, so
                                                 # "500, 850" stays two numbers
    return set(_NUMBER.findall(text))


def _stems(text: str) -> set[str]:
    return {w[:6] for w in re.findall(r"[a-z]+", text.lower())
            if len(w) >= 4 and w not in _STOPWORDS}
                                                 # crude stemming: first 6 letters, so "contraindicated" and
                                                 # "contraindication" both become "contra"; short and common
                                                 # words dropped


def _topics(text: str) -> set[str]:
    t = text.lower()
    return {name for name, patterns in HIGH_RISK_TOPICS.items()
            if any(re.search(r"\b" + p, t) for p in patterns)}
                                                 # \b forces a word-boundary start so "contrast" doesn't match
                                                 # inside another word; returns the set of topics present


def _factual_sentences(text: str) -> list[str]:
    """Sentences that state facts (skips headings, very short lines, safety disclaimer)."""
    sentences = []
    for line in text.splitlines():               # work line by line so bullets are handled individually
        line = line.strip().lstrip("-*• ").strip()   # remove bullet characters before analysing
        if not line or line.endswith(":"):       # blank lines and headings ("Side effects:") aren't claims
            continue
        for s in re.split(r"(?<=[.!?])\s+", line):   # split on sentence end while keeping the punctuation
            s = s.strip()
            if len(s.split()) < 4 or any(p in s.lower() for p in _SKIP_PHRASES):
                continue                         # ignore fragments under 4 words and the doctor disclaimer
            sentences.append(s)
    return sentences


def process(answer: str, evidence: list[RetrievedChunk], question: str = "",
            external_citation: Citation | None = None) -> CitationResult:
                                                 # question is needed for topic grounding; external_citation is FAERS
    old_to_new: dict[int, int] = {}              # maps the model's numbering to display numbering
    citations: list[Citation] = []
    invalid: set[int] = set()                    # a set, because the same fake number may appear twice

    def cite(n: int) -> int:
        """Register excerpt n (1-based) as a citation; return its new number."""
        if n not in old_to_new:                  # first time this excerpt is cited
            old_to_new[n] = len(old_to_new) + 1  # assign the next display number, in order of appearance
            c = evidence[n - 1].chunk            # -1 because the model counts from 1, Python from 0
            citations.append(Citation(chunk_id=c.chunk_id, doc=c.source_file,
                                      section=c.section, page=c.page,
                                      source=c.source, url=c.source_url))
                                                 # this is where a bare [2] becomes a real doc/section/page
        return old_to_new[n]

    external_marker = False                      # tracks whether the answer used [FAERS]

    def renumber(match: re.Match) -> str:
        nonlocal external_marker                 # needed to modify the outer variable from inside
        kept = []
        for part in match.group(1).split(","):   # handles [1,3] as two references
            if part.strip().upper() == "FAERS":
                external_marker = True           # FAERS isn't an excerpt index, so it's tracked separately
                continue
            n = int(part)
            if not 1 <= n <= len(evidence):      # THE FAKE-CITATION CHECK: the model cited an excerpt
                invalid.add(n)                   # that doesn't exist -> record it and drop the marker
                continue
            kept.append(cite(n))
        markers = "".join(f"[{k}]" for k in sorted(set(kept)))   # set removes duplicates, sorted keeps order stable
        return f"{markers}[FAERS]" if external_marker else markers

    text = _MARKER.sub(renumber, _normalize(answer))   # normalize first, then rewrite every marker
    text = re.sub(r"[ \t]+([.,;:])", r"\1", text)      # tidy space left by removed markers

    # 1) Auto-cite uncited sentences that are clearly supported by one excerpt
    auto = []
    for s in _factual_sentences(text):
        if _MARKER.search(s):
            continue                             # already cited, nothing to do
        stems, nums = _stems(s), _numbers(s)
        if len(stems) < 3:
            continue                             # too little content to judge safely
        best, best_ratio = None, 0.0
        for idx, r in enumerate(evidence, start=1):
            if not nums <= _numbers(r.chunk.text):      # every number must be in the excerpt
                continue                         # "<=" is subset: a sentence with an invented number is skipped,
                                                 # so auto-citation can never legitimise a wrong figure
            ratio = len(stems & _stems(r.chunk.text)) / len(stems)
                                                 # share of the sentence's key words found in this excerpt
            if ratio > best_ratio:
                best, best_ratio = idx, ratio    # keep the best-matching excerpt
        if best is not None and best_ratio >= MIN_OVERLAP:
            k = cite(best)
            fixed = s[:-1] + f" [{k}]" + s[-1] if s[-1] in ".!?" else f"{s} [{k}]"
                                                 # insert the marker before the final punctuation, matching the
                                                 # format the prompt asks the model for
            text = text.replace(s, fixed, 1)     # count=1 so only this occurrence changes
            auto.append(s)

    # 2) Every number in a cited sentence must appear in its cited excerpt(s)
    new_to_chunk = {new: evidence[old - 1].chunk for old, new in old_to_new.items()}
                                                 # reverse map: display number -> the chunk it points to
    unsupported = []
    for s in _factual_sentences(text):
        refs = [int(x) for group in _MARKER.findall(s) for x in group.split(",")
            if x.strip().isdigit()]              # isdigit() skips [FAERS], which has no chunk
        if not refs:
            continue                             # uncited sentences are handled by coverage, not here
        source = " ".join(new_to_chunk[k].text for k in refs if k in new_to_chunk)
        missing = _numbers(s) - _numbers(source) # set difference: numbers in the claim but not in its source
        if missing:
            unsupported.append(f"{s}  (not in source: {', '.join(sorted(missing))})")
                                                 # THE DOSE-SAFETY CHECK: catches "3000 mg" when the label says 2550

    # 3) High-risk topics in the question or answer must be covered by the cited excerpts
    cited_text = " ".join(c.text for c in new_to_chunk.values())   # only the cited chunks, not all retrieved
    ungrounded = sorted(_topics(question + " " + text) - _topics(cited_text))
                                                 # topics raised minus topics the sources actually discuss;
                                                 # this is what caught "contraindicated in pregnant women [3]"
                                                 # when excerpt 3 never mentioned pregnancy

    # 4) Coverage
    facts = _factual_sentences(text)
    uncited = [s for s in facts if not _MARKER.search(s)]
    coverage = 1.0 if not facts else round((len(facts) - len(uncited)) / len(facts), 2)
                                                 # no factual sentences means nothing to cite, so 1.0 rather than
                                                 # dividing by zero

    if external_citation is not None and (external_marker or external_citation.source == "faers"):
        citations.append(external_citation)      # FAERS gets its own citation entry, listed last
    return CitationResult(text=text, citations=citations, invalid_refs=sorted(invalid),
                          coverage=coverage, uncited=uncited, auto_cited=auto,
                          unsupported_numbers=unsupported, ungrounded_topics=ungrounded)
                                                 # note: this function only REPORTS problems; pipeline.py decides
                                                 # what escalates, keeping policy separate from detection


if __name__ == "__main__":                       # self-test with hand-written answers, no LLM needed
    from backend.rag.sample_chunks import SAMPLE_CHUNKS

    by_id = {c.chunk_id: c for c in SAMPLE_CHUNKS}     # lookup so tests can pick chunks by name
    evidence = [RetrievedChunk(chunk=by_id[i], score=0.6)
                for i in ("met-ind-1", "met-dose-1", "met-ci-1")]   # a fixed 3-excerpt context

    tests = {                                    # each entry: (question, answer) exercising one behaviour
        "GOOD answer": ("What is the dose?",
                        "The maximum recommended dose is 2550 mg per day [2]. "
                        "Start with 500 mg twice a day with meals [2]. "
                        "It must not be used in severe renal impairment [3]."),
                                                 # expect: coverage 1.0, renumbered [2]->[1], [3]->[2]
        "BAD answer": ("What is the dose?",
                       "The maximum recommended dose is 2550 mg per day [2][7]. "
                       "It is also safe during pregnancy for most patients. "
                       "It is used for type 2 diabetes [1]."),
                                                 # expect: [7] invalid, pregnancy claim stays uncited AND ungrounded
        "TRAILING-citation answer": ("What is the dose?",
                                     "The maximum recommended dose is 2550 mg per day. [2]\n\n"
                                     "* Take metformin with your meals. [2]\n"
                                     "* Do not use it with severe kidney problems. [3]\n\n"
                                     "Please talk to your doctor or pharmacist before making any change."),
                                                 # expect: markers moved before the stops, disclaimer skipped, 1.0
        "SUPPORTED-but-uncited answer": ("Can people with kidney problems take metformin?",
                                         "No, metformin must not be used in severe renal impairment [3]. "
                                         "Severe renal impairment (eGFR below 30 mL/min/1.73 m2) "
                                         "is a contraindication for metformin."),
                                                 # expect: second sentence auto-cited; kidney topic grounded by "renal"
        "WRONG-NUMBER answer": ("What is the maximum dose?",
                                "The maximum recommended dose is 3000 mg per day [2]."),
                                                 # expect: 3000 flagged in unsupported_numbers
        "PREGNANCY hallucination": ("Is metformin safe during pregnancy?",
                                    "No, metformin is contraindicated in pregnant women [3]."),
                                                 # expect: ungrounded ['pregnancy'] — the real bug this caught
        "CHILDREN (label says pediatric)": ("Can children take metformin?",
                                            "Yes, pediatric patients 10 years and older can use it [1]."),
                                                 # expect: ungrounded [] — synonym matching must not over-block
    }
    for name, (question, answer) in tests.items():
        r = process(answer, evidence, question=question)
        print(f"\n===== {name} =====")
        print(r.text)
        print(f"citations:   {[(c.chunk_id, c.page) for c in r.citations]}")
        print(f"invalid:     {r.invalid_refs}   coverage: {r.coverage}")
        print(f"uncited:     {r.uncited}")
        print(f"auto_cited:  {r.auto_cited}")
        print(f"bad numbers: {r.unsupported_numbers}")
        print(f"ungrounded:  {r.ungrounded_topics}")