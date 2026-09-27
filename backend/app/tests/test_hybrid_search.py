from backend.rag import vector_store


class FakeTable:
    def count_rows(self):
        return 3

    def search(self, query, **kwargs):
        return FakeSearch(query, kwargs.get("query_type"))


class FakeSearch:
    def __init__(self, query, query_type):
        self.query = query
        self.query_type = query_type

    def metric(self, _name):
        return self

    def where(self, _expression):
        return self

    def limit(self, _limit):
        return self

    def to_list(self):
        if self.query_type == "fts":
            return [
                {"chunk_id": "exact-rate", "text": "53% diarrhea", "_distance": 0.8},
                {"chunk_id": "general", "text": "diarrhea may occur", "_distance": 0.7},
            ]
        return [
            {"chunk_id": "general", "text": "diarrhea may occur", "_distance": 0.1},
            {"chunk_id": "exact-rate", "text": "53% diarrhea", "_distance": 0.4},
        ]


def test_statistical_query_fuses_exact_bm25_hit(monkeypatch):
    monkeypatch.setattr(vector_store, "get_table", lambda: FakeTable())
    monkeypatch.setattr(vector_store, "embed", lambda _texts: [[0.1, 0.2]])
    monkeypatch.setattr(vector_store, "_ensure_fts_index", lambda _table: None)

    rows = vector_store.hybrid_search("What percentage experience diarrhea?", limit=2)

    assert rows[0]["chunk_id"] == "exact-rate"
    assert rows[0]["_retrieval_score"] == 0.6