# API & Event Contracts

Agree on these BEFORE coding — this is what lets everyone build against each other's services
without waiting for them to actually exist yet.

One file per service:
- `auth-service.md`
- `academic-service.md`
- `finance-service.md`
- `hr-service.md`
- `notification-service.md`

Each file should list:
1. Every REST endpoint: method, path, request body, response shape, status codes
2. Every RabbitMQ event this service publishes: event name (`domain.entity.action`), payload fields
3. Every RabbitMQ event this service subscribes to, and what it does when it receives one
