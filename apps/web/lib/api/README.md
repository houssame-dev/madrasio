# `lib/api`

HTTP adapter boundary.

Route Handlers, Server Actions, and request/response DTO mappers live here.

Business logic must NOT be implemented in this layer. Handlers call into
`modules/<domain>/application/` use cases and translate the results into
DTOs.
