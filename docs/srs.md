# Software Requirements Specification — School ERP

**Owner:** Person E (consolidating), with input from everyone on their own module.
Aligned to ISO/IEC/IEEE 29148. Keep this + the technical report under 20 pages (excluding
appendices/diagrams) per the brief.

## 1. Introduction
- Purpose
- Scope
- Definitions, acronyms

## 2. Overall description
- Product perspective (the 5-service architecture — link the deployment diagram)
- User classes (Super Admin, Admin, Staff, Student)
- Assumptions and constraints (mandatory architectural constraints from the brief)

## 3. Functional requirements
- 3.1 Authentication & Authorization
- 3.2 Academic Module
- 3.3 Marketing & Finance Module
- 3.4 Administration & HR Module
- 3.5 Notifications

## 4. Non-functional requirements
- Performance (load-testing targets)
- Security (OWASP Top 10 mitigations)
- Scalability
- Availability / logging & monitoring

## 5. External interface requirements
- REST API summary (link `docs/api-contracts/`)
- RabbitMQ event summary
