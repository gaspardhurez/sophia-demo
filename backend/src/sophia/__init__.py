def main() -> None:
    """Lance le serveur de dev uvicorn (entry-point `sophia`)."""
    import uvicorn

    uvicorn.run("sophia.main:app", host="127.0.0.1", port=8000, reload=True)
