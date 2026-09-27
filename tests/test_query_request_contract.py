def test_query_request_contract_unchanged():
    from backend.safety.schemas import QueryRequest

    req = QueryRequest(
        session_id="s1",
        query="usual dose?",
        mode="patient",
        drug_name="metformin",
    )

    assert req.session_id == "s1"
    assert req.query == "usual dose?"
    assert req.mode == "patient"
    assert req.drug_name == "metformin"
