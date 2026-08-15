# ADR-006: Cloudflare R2 for File Storage

- Status: Accepted
- Date: 2026-08-15

## Context

The system supports attachments such as:

- PDF
- Images
- DOCX
- Other approved document types

Binary files should not be stored inside PostgreSQL.

## Decision

Use Cloudflare R2 for V1 object storage.

PostgreSQL stores:

- File metadata
- Domain relationships
- Processing state

R2 stores:

- Actual binary files

## Security

Files are private by default.

Access requires successful authorization before a temporary access capability is created.

## Consequences

### Positive

- Separates binary storage from relational data
- Suitable for attachments
- Cost-efficient
- Supports private object storage

### Negative

- Additional external dependency
- Requires upload/download security handling