// OpenAPI 3 description of this service. Served as JSON at /api/v1/hr/openapi.json
// and as an interactive Swagger UI at /api/v1/hr/docs.
// Keep it in sync with docs/api-contracts/hr-service.md when endpoints change.

const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: example } } },
});

const UNAUTHORIZED = errorResponse('Missing or invalid token', { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' });
const FORBIDDEN = errorResponse('Caller\'s role (or tenant) doesn\'t allow this', { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' });
const NOT_FOUND = (thing) => errorResponse(`${thing} not found (including in another tenant)`, { code: 'NOT_FOUND', message: `${thing} not found` });
const VALIDATION = errorResponse('Request body failed validation', {
  code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'email', message: '"email" must be a valid email' }],
});
const bearer = [{ bearerAuth: [] }];

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'School ERP — HR Service',
    version: '1.0.0',
    description:
      'Employee records, QR attendance, leave, CNPS/PAYE payroll and asset inventory — one school (tenant) at ' +
      'a time. Identity comes from the API Gateway (`x-user-id`/`x-user-role`/`x-tenant-id`, already verified ' +
      'against auth-service) or, for local development without the gateway, a JWT signed with the shared ' +
      '`JWT_SECRET` (claims `sub`/`role`/`tenant_id`, matching auth-service\'s access token). ' +
      'Every error uses the same shape across the whole system: `{ "error": { "code", "message", "details"? } }`.',
  },
  tags: [
    { name: 'Employees' }, { name: 'Attendance' }, { name: 'Leave' },
    { name: 'Payroll' }, { name: 'Assets' }, { name: 'Dashboard' }, { name: 'Health' },
  ],
  security: bearer,
  paths: {
    '/api/v1/hr/employees': {
      post: {
        tags: ['Employees'], summary: 'Create an employee', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. `matricule` is generated automatically (`EMP<year>-<seq>`, per tenant) and cannot be set.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeCreateRequest' } } } },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          400: VALIDATION, 401: UNAUTHORIZED, 403: FORBIDDEN,
          409: errorResponse('Email already used in this tenant', { code: 'CONFLICT', message: 'Email already in use' }),
        },
      },
      get: {
        tags: ['Employees'], summary: 'List / search employees', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Paginated, 10/page by default.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches name or matricule' },
          { name: 'department', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'A page of employees',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Employee' } },
                    total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' },
                  },
                },
              },
            },
          },
          401: UNAUTHORIZED, 403: FORBIDDEN,
        },
      },
    },
    '/api/v1/hr/employees/me': {
      get: {
        tags: ['Employees'], summary: 'My own employee record', security: bearer,
        description: 'Any authenticated caller. Resolved from their login account\'s `userId` link — 404 if nobody has linked it yet.',
        responses: {
          200: { description: 'The caller\'s employee record', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          401: UNAUTHORIZED, 404: NOT_FOUND('No employee record linked to your account'),
        },
      },
    },
    '/api/v1/hr/employees/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Employees'], summary: 'Get one employee', security: bearer,
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Employee') },
      },
      put: {
        tags: ['Employees'], summary: 'Update an employee', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Any field except `matricule`.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeUpdateRequest' } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } }, 400: VALIDATION, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Employee') },
      },
      delete: {
        tags: ['Employees'], summary: 'Deactivate (soft delete)', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Sets `status = inactive` — never removes the row, and excludes them from future payroll runs.',
        responses: {
          200: { description: 'Deactivated', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, employee: { $ref: '#/components/schemas/Employee' } } } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Employee'),
        },
      },
    },
    '/api/v1/hr/attendance/qr/{employeeId}': {
      get: {
        tags: ['Attendance'], summary: 'Get today\'s QR badge', security: bearer,
        description: 'Self or manager. The QR payload is `employeeId:date:signature` (HMAC-SHA256), re-signed daily; check-in rejects it after 24h regardless.',
        parameters: [{ name: 'employeeId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { employeeId: { type: 'integer' }, image: { type: 'string', description: 'data:image/png;base64,... — the rendered QR code' }, qrData: { type: 'string' } } } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Employee'),
        },
      },
    },
    '/api/v1/hr/attendance/checkin': {
      post: {
        tags: ['Attendance'], summary: 'Check in by scanning (or simulating) a QR badge', security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['qrData'], properties: { qrData: { type: 'string' }, location: { type: 'string' } } } } } },
        responses: {
          201: { description: 'Checked in — status is `present` or `late` (after 08:30)', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, attendance: { $ref: '#/components/schemas/Attendance' } } } } } },
          400: errorResponse('Bad/expired/tampered QR', { code: 'INVALID_QR', message: 'QR code expired' }),
          401: UNAUTHORIZED,
          404: NOT_FOUND('Employee (or inactive)'),
          409: errorResponse('Already checked in today', { code: 'CONFLICT', message: 'Already checked in today at 08:15' }),
        },
      },
    },
    '/api/v1/hr/attendance/checkout': {
      post: {
        tags: ['Attendance'], summary: 'Check out', security: bearer,
        description: '`employeeId` in the body is only honoured for ADMIN/SUPER_ADMIN — everyone else always checks themselves out.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { employeeId: { type: 'integer' } } } } } },
        responses: {
          200: { description: 'Checked out, duration computed', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, attendance: { $ref: '#/components/schemas/Attendance' } } } } } },
          400: errorResponse('No check-in on record today', { code: 'VALIDATION_ERROR', message: 'You must check in before checking out' }),
          401: UNAUTHORIZED,
          409: errorResponse('Already checked out today', { code: 'CONFLICT', message: 'Already checked out today' }),
        },
      },
    },
    '/api/v1/hr/attendance/my': {
      get: {
        tags: ['Attendance'], summary: 'My monthly attendance calendar', security: bearer,
        parameters: [{ name: 'month', in: 'query', schema: { type: 'integer' } }, { name: 'year', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceCalendar' } } } }, 401: UNAUTHORIZED },
      },
    },
    '/api/v1/hr/attendance/my/{employeeId}': {
      get: {
        tags: ['Attendance'], summary: 'A specific employee\'s monthly calendar', security: bearer,
        description: 'Self or manager.',
        parameters: [
          { name: 'employeeId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'month', in: 'query', schema: { type: 'integer' } }, { name: 'year', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceCalendar' } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN },
      },
    },
    '/api/v1/hr/leaves': {
      post: {
        tags: ['Leave'], summary: 'Request leave', security: bearer,
        description: '`employeeId` in the body is only honoured for ADMIN/SUPER_ADMIN — everyone else always requests for themselves. ' +
          '`days` is computed server-side (business days, weekends excluded). Annual leave is checked against the running balance; sick/maternity/paternity are not capped.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LeaveRequest' } } } },
        responses: {
          201: { description: 'Created, status `pending`', content: { 'application/json': { schema: { $ref: '#/components/schemas/Leave' } } } },
          400: errorResponse('Bad dates or insufficient balance', { code: 'VALIDATION_ERROR', message: 'Insufficient leave balance: 5 day(s) remaining, 8 requested' }),
          401: UNAUTHORIZED,
        },
      },
      get: {
        tags: ['Leave'], summary: 'List leave requests', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only.',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }, { name: 'employeeId', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Leave' } } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN },
      },
    },
    '/api/v1/hr/leaves/my': {
      get: {
        tags: ['Leave'], summary: 'My own leave requests', security: bearer,
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Leave' } } } } }, 401: UNAUTHORIZED, 404: NOT_FOUND('No employee record linked to your account') },
      },
    },
    '/api/v1/hr/leaves/calendar': {
      get: {
        tags: ['Leave'], summary: 'Who is on approved leave this month', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only.',
        parameters: [{ name: 'month', in: 'query', schema: { type: 'integer' } }, { name: 'year', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { month: { type: 'integer' }, year: { type: 'integer' }, leaves: { type: 'array', items: { $ref: '#/components/schemas/Leave' } } } } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN,
        },
      },
    },
    '/api/v1/hr/leaves/balance/{employeeId}': {
      get: {
        tags: ['Leave'], summary: 'Leave balance for a year', security: bearer,
        description: 'Self or manager. Auto-creates a balance row (20 annual days default) on first lookup for that year.',
        parameters: [{ name: 'employeeId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'year', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LeaveBalance' } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Employee') },
      },
    },
    '/api/v1/hr/leaves/{id}/approve': {
      put: {
        tags: ['Leave'], summary: 'Approve a pending request', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. The approver is always the authenticated caller — never a client-supplied value. Deducts the balance and publishes `hr.leave.approved`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Approved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Leave' } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Leave request'),
          409: errorResponse('Already decided', { code: 'CONFLICT', message: 'Leave already approved' }),
        },
      },
    },
    '/api/v1/hr/leaves/{id}/reject': {
      put: {
        tags: ['Leave'], summary: 'Reject a pending request', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. `rejectionReason` is required. Publishes `hr.leave.rejected`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rejectionReason'], properties: { rejectionReason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Rejected', content: { 'application/json': { schema: { $ref: '#/components/schemas/Leave' } } } }, 400: VALIDATION, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Leave request'), 409: errorResponse('Already decided', { code: 'CONFLICT', message: 'Leave already rejected' }) },
      },
    },
    '/api/v1/hr/payroll/generate': {
      post: {
        tags: ['Payroll'], summary: 'Generate a draft payroll run', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. One line per active employee: CNPS = min(base × 4.2%, 27,500 FCFA), PAYE from configurable brackets on the remainder.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['month', 'year'], properties: { month: { type: 'integer', minimum: 1, maximum: 12 }, year: { type: 'integer' } } } } } },
        responses: {
          201: { description: 'Draft created', content: { 'application/json': { schema: { type: 'object', properties: { payroll: { $ref: '#/components/schemas/Payroll' }, items: { type: 'array', items: { $ref: '#/components/schemas/PayrollItem' } } } } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN,
          409: errorResponse('Already generated for that period', { code: 'CONFLICT', message: 'Payroll for 9/2026 already exists' }),
        },
      },
    },
    '/api/v1/hr/payroll': {
      get: {
        tags: ['Payroll'], summary: 'Get a payroll run', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only.',
        parameters: [{ name: 'month', in: 'query', schema: { type: 'integer' } }, { name: 'year', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { payroll: { $ref: '#/components/schemas/Payroll' }, items: { type: 'array', items: { $ref: '#/components/schemas/PayrollItem' } } } } } } },
          401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Payroll for that period'),
        },
      },
    },
    '/api/v1/hr/payroll/my': {
      get: {
        tags: ['Payroll'], summary: 'My own paid payslips', security: bearer,
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, month: { type: 'integer' }, year: { type: 'integer' }, net: { type: 'number' }, paidAt: { type: 'string', format: 'date-time' } } } } } } }, 401: UNAUTHORIZED, 404: NOT_FOUND('No employee record linked to your account') },
      },
    },
    '/api/v1/hr/payroll/item/{itemId}': {
      put: {
        tags: ['Payroll'], summary: 'Adjust bonus/deductions on a draft line', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Recomputes `net`; CNPS and PAYE stay as generated.',
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { bonus: { type: 'number', minimum: 0 }, deductions: { type: 'number', minimum: 0 } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/PayrollItem' } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Payroll item'), 409: errorResponse('Parent payroll already paid', { code: 'CONFLICT', message: 'Payroll is already paid and locked for edits' }) },
      },
    },
    '/api/v1/hr/payroll/{id}/pay': {
      put: {
        tags: ['Payroll'], summary: 'Mark a payroll run as paid', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Locks it from further edits and publishes `hr.payroll.processed`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Paid', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, payroll: { $ref: '#/components/schemas/Payroll' } } } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Payroll'), 409: errorResponse('Already paid', { code: 'CONFLICT', message: 'Payroll already marked as paid' }) },
      },
    },
    '/api/v1/hr/payroll/payslip/{itemId}': {
      get: {
        tags: ['Payroll'], summary: 'Download a payslip PDF', security: bearer,
        description: 'Self (owner of the line) or manager. Only available once the parent payroll is `paid`.',
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
          401: UNAUTHORIZED,
          403: errorResponse('Not the owner/a manager, or payroll not paid yet', { code: 'FORBIDDEN', message: 'Payslip is only available once payroll is marked as paid' }),
          404: NOT_FOUND('Payslip'),
        },
      },
    },
    '/api/v1/hr/assets': {
      post: {
        tags: ['Assets'], summary: 'Register an asset', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. `assignedTo` must be an employee in the caller\'s own tenant.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetRequest' } } } },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } }, 400: VALIDATION, 401: UNAUTHORIZED, 403: FORBIDDEN },
      },
      get: {
        tags: ['Assets'], summary: 'List assets', security: bearer,
        description: 'Any authenticated caller.',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'assigned', 'maintenance', 'retired'] } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Asset' } } } } }, 401: UNAUTHORIZED },
      },
    },
    '/api/v1/hr/assets/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      put: {
        tags: ['Assets'], summary: 'Update an asset', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetRequest' } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } }, 400: VALIDATION, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Asset') },
      },
      delete: {
        tags: ['Assets'], summary: 'Delete an asset', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only.',
        responses: { 204: { description: 'Deleted' }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND('Asset') },
      },
    },
    '/api/v1/hr/dashboard/stats': {
      get: {
        tags: ['Dashboard'], summary: 'Workforce dashboard stats', security: bearer,
        description: 'ADMIN/SUPER_ADMIN only. Cards + chart data for today\'s attendance, on-leave count, per-department headcount, and a 7-day attendance trend.',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/DashboardStats' } } } }, 401: UNAUTHORIZED, 403: FORBIDDEN },
      },
    },
    '/health': {
      get: {
        tags: ['Health'], summary: 'Liveness + DB check', security: [],
        responses: {
          200: { description: 'Healthy', content: { 'application/json': { schema: { type: 'object', properties: { service: { type: 'string' }, status: { type: 'string', enum: ['ok'] }, db: { type: 'string', enum: ['up'] }, timestamp: { type: 'string', format: 'date-time' } } } } } },
          503: { description: 'Database unreachable', content: { 'application/json': { schema: { type: 'object', properties: { service: { type: 'string' }, status: { type: 'string', enum: ['degraded'] }, db: { type: 'string', enum: ['down'] } } } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
        description: 'Dev-only direct path. In production, identity instead comes from the gateway\'s x-user-id/x-user-role/x-tenant-id headers — see the service description.',
      },
    },
    schemas: {
      Error: {
        type: 'object', required: ['error'],
        properties: {
          error: {
            type: 'object', required: ['code', 'message'],
            properties: {
              code: { type: 'string', enum: ['VALIDATION_ERROR', 'UNAUTHORIZED', 'INVALID_TOKEN', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INVALID_QR', 'INVALID_JSON', 'PAYLOAD_TOO_LARGE', 'INTERNAL_ERROR'] },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
            },
          },
        },
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, tenantId: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid', nullable: true, description: 'Linked auth-service account, if any' },
          matricule: { type: 'string', example: 'EMP2026-001' },
          firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true }, department: { type: 'string' }, role: { type: 'string' },
          hireDate: { type: 'string', format: 'date' }, baseSalary: { type: 'string', example: '420000.00' },
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      },
      EmployeeCreateRequest: {
        type: 'object', required: ['firstName', 'lastName', 'email', 'department', 'role', 'hireDate', 'baseSalary'],
        properties: {
          firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true }, department: { type: 'string' }, role: { type: 'string' },
          hireDate: { type: 'string', format: 'date' }, baseSalary: { type: 'number', minimum: 0 },
          userId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      EmployeeUpdateRequest: {
        allOf: [{ $ref: '#/components/schemas/EmployeeCreateRequest' }],
        description: 'All fields optional on update; `status` (active/inactive) may also be set. `matricule` is never accepted.',
      },
      Attendance: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, employeeId: { type: 'integer' }, date: { type: 'string', format: 'date' },
          checkInTime: { type: 'string', format: 'date-time', nullable: true }, checkOutTime: { type: 'string', format: 'date-time', nullable: true },
          durationMinutes: { type: 'integer', nullable: true }, location: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['present', 'late', 'absent', 'leave'] },
        },
      },
      AttendanceCalendar: {
        type: 'object',
        properties: {
          employeeId: { type: 'integer' }, month: { type: 'integer' }, year: { type: 'integer' },
          calendar: {
            type: 'array',
            items: { type: 'object', properties: { date: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['present', 'late', 'absent', 'leave', 'weekend', 'upcoming'] } } },
          },
        },
      },
      Leave: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, employeeId: { type: 'integer' },
          type: { type: 'string', enum: ['annual', 'sick', 'maternity', 'paternity'] },
          startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, days: { type: 'integer' },
          reason: { type: 'string', nullable: true }, attachmentUrl: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          approvedBy: { type: 'string', format: 'uuid', nullable: true }, rejectionReason: { type: 'string', nullable: true },
        },
      },
      LeaveRequest: {
        type: 'object', required: ['type', 'startDate', 'endDate'],
        properties: {
          employeeId: { type: 'integer', description: 'Manager-only; ignored for a Staff caller, who always requests for themselves' },
          type: { type: 'string', enum: ['annual', 'sick', 'maternity', 'paternity'] },
          startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' },
          reason: { type: 'string' }, attachmentUrl: { type: 'string', format: 'uri' },
        },
      },
      LeaveBalance: {
        type: 'object',
        properties: {
          employeeId: { type: 'integer' }, year: { type: 'integer' },
          annual: { type: 'object', properties: { total: { type: 'integer' }, used: { type: 'integer' }, remaining: { type: 'integer' } } },
          sick: { type: 'object', properties: { used: { type: 'integer' } } },
          maternity: { type: 'object', properties: { used: { type: 'integer' } } },
          paternity: { type: 'object', properties: { used: { type: 'integer' } } },
        },
      },
      Payroll: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, month: { type: 'integer' }, year: { type: 'integer' },
          status: { type: 'string', enum: ['draft', 'paid'] },
          generatedAt: { type: 'string', format: 'date-time' }, paidAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PayrollItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, payrollId: { type: 'integer' }, employeeId: { type: 'integer' },
          baseSalary: { type: 'string' }, bonus: { type: 'string' }, deductions: { type: 'string' },
          cnpsEmployee: { type: 'string', description: 'min(baseSalary × 4.2%, 27500)' },
          taxable: { type: 'string' }, paye: { type: 'string', description: 'Marginal-bracket IRPP on `taxable`' },
          net: { type: 'string' },
        },
      },
      Asset: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string' }, category: { type: 'string' }, serialNumber: { type: 'string' },
          status: { type: 'string', enum: ['available', 'assigned', 'maintenance', 'retired'] },
          assignedTo: { type: 'integer', nullable: true }, purchaseDate: { type: 'string', format: 'date', nullable: true },
          value: { type: 'number', nullable: true },
        },
      },
      AssetRequest: {
        type: 'object', required: ['name', 'category', 'serialNumber'],
        properties: {
          name: { type: 'string' }, category: { type: 'string' }, serialNumber: { type: 'string' },
          status: { type: 'string', enum: ['available', 'assigned', 'maintenance', 'retired'] },
          assignedTo: { type: 'integer', nullable: true }, purchaseDate: { type: 'string', format: 'date', nullable: true },
          value: { type: 'number', nullable: true },
        },
      },
      DashboardStats: {
        type: 'object',
        properties: {
          cards: {
            type: 'object',
            properties: { totalActiveEmployees: { type: 'integer' }, presentToday: { type: 'integer' }, onLeaveToday: { type: 'integer' }, lateArrivalsToday: { type: 'integer' } },
          },
          charts: {
            type: 'object',
            properties: {
              employeesPerDepartment: { type: 'array', items: { type: 'object', properties: { department: { type: 'string' }, count: { type: 'integer' } } } },
              attendanceToday: { type: 'object', properties: { present: { type: 'integer' }, late: { type: 'integer' }, onLeave: { type: 'integer' }, absent: { type: 'integer' } } },
              attendanceTrend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', format: 'date' }, present: { type: 'integer' } } } },
            },
          },
        },
      },
    },
  },
};
