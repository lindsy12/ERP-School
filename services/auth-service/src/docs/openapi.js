// OpenAPI 3 description of this service. Served as JSON at /api/v1/auth/openapi.json
// and as an interactive Swagger UI at /api/v1/auth/docs.
// Keep it in sync with docs/api-contracts/auth-service.md when endpoints change.

const errorResponse = (description, code, message) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: { code, message } },
    },
  },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'School ERP — Auth Service',
    version: '1.0.0',
    description:
      'Login, JWT issuing, refresh-token rotation, logout, password changes, the current user and account ' +
      'management by admins. Every error uses the same shape: ' +
      '`{ "error": { "code", "message", "details"? } }`.',
  },
  tags: [{ name: 'Auth' }, { name: 'Users', description: 'Account management (ADMIN, SUPER_ADMIN)' }, { name: 'Health' }],
  paths: {
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'Returns a 15-minute access token and a 7-day refresh token. ' +
          'Unknown email, wrong password and disabled account all return the same 401 ' +
          'so the response never reveals which emails are registered. After 5 wrong passwords in a row ' +
          '(`MAX_FAILED_ATTEMPTS`) the account is locked for 15 minutes (`LOCKOUT_MINUTES`): every login, ' +
          'even with the right password, gets 423 until then. A successful login resets the count.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: {
            description: 'Logged in',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } },
          },
          400: {
            description: 'Missing or invalid fields (`VALIDATION_ERROR`), or malformed JSON (`INVALID_JSON`)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request body is invalid',
                    details: [{ field: 'email', message: 'must be a valid email address' }],
                  },
                },
              },
            },
          },
          401: errorResponse('Wrong credentials', 'INVALID_CREDENTIALS', 'Invalid email or password'),
          423: errorResponse(
            'Too many failed logins: locked until the lockout period ends or an admin unlocks it. ' +
              'Also returned by the attempt that causes the lock.',
            'ACCOUNT_LOCKED',
            'Account temporarily locked',
          ),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Swap a refresh token for a new access + refresh token pair',
        description:
          'Rotation: each refresh token works once. The one sent is revoked and a new one is issued ' +
          'in the same session (token family). Sending a token that was already rotated is treated ' +
          'as theft: the whole session is revoked, a security warning is logged, and 401 is returned.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } } },
        },
        responses: {
          200: {
            description: 'New token pair. The refresh token sent is no longer valid.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } },
          },
          400: errorResponse('`refresh_token` missing or not a string', 'VALIDATION_ERROR', 'Request body is invalid'),
          401: errorResponse(
            'Unknown, expired, revoked or reused refresh token. The client must log in again.',
            'INVALID_REFRESH_TOKEN',
            'Refresh token is invalid or expired',
          ),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End the session the refresh token belongs to',
        description:
          'Revokes every refresh token of that session, and the access token sent with the call: it is ' +
          'rejected from the next request on. Other sessions of the user are not affected. Ending a session ' +
          'that is already ended succeeds (with a still-valid access token, e.g. from another session).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } } },
        },
        responses: {
          204: { description: 'Session ended' },
          400: errorResponse('`refresh_token` missing or not a string', 'VALIDATION_ERROR', 'Request body is invalid'),
          401: errorResponse(
            'Access token missing/invalid (`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`), or the refresh ' +
              'token is unknown or belongs to another user (`INVALID_REFRESH_TOKEN`)',
            'INVALID_REFRESH_TOKEN',
            'Refresh token is invalid or expired',
          ),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change your own password',
        description:
          'Needs the current password. A wrong one counts as a failed login (see the lockout on `/login`). ' +
          'On success every session of the user ends, access tokens issued before now are rejected, and a ' +
          'fresh token pair is returned so the caller stays logged in. Logged as `auth.password.changed`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } } },
        },
        responses: {
          200: {
            description: 'Password changed; use the new tokens from now on',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } },
          },
          400: {
            description:
              'Invalid fields, new password too short or equal to the current one, or wrong current password',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request body is invalid',
                    details: [{ field: 'current_password', message: 'is incorrect' }],
                  },
                },
              },
            },
          },
          401: errorResponse('Missing, invalid, expired or revoked access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          423: errorResponse('Account locked by too many wrong passwords', 'ACCOUNT_LOCKED', 'Account temporarily locked'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/users': {
      post: {
        tags: ['Users'],
        summary: 'Create an account in your school',
        description:
          'ADMIN may create STAFF and STUDENT; SUPER_ADMIN may also create ADMIN. SUPER_ADMIN accounts are ' +
          "only created by `npm run seed`. The account belongs to the caller's school. Logged as `auth.user.created`.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserRequest' } } },
        },
        responses: {
          201: {
            description: 'Created. `Location` header: `/api/v1/auth/users/{id}`',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          400: errorResponse('Invalid or unknown fields (`details` lists them)', 'VALIDATION_ERROR', 'Request body is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller may not create this role', 'FORBIDDEN', 'You do not have permission to perform this action'),
          409: errorResponse('Email already used in this school', 'EMAIL_TAKEN', 'A user with this email already exists in this school'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
      get: {
        tags: ['Users'],
        summary: "List your school's accounts",
        description: 'Newest first. ADMIN and SUPER_ADMIN see every account of their school.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'One page of accounts',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserList' } } },
          },
          400: errorResponse('Bad `role`, `page` or `limit`', 'VALIDATION_ERROR', 'Request is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller is not ADMIN or SUPER_ADMIN', 'FORBIDDEN', 'You do not have permission to perform this action'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Users'],
        summary: 'Get one account of your school',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'The account', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: errorResponse('`id` is not a UUID', 'VALIDATION_ERROR', 'Request is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller is not ADMIN or SUPER_ADMIN', 'FORBIDDEN', 'You do not have permission to perform this action'),
          404: errorResponse("No such user in the caller's school", 'NOT_FOUND', 'User not found'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Change the role of an account, or disable / re-enable it',
        description:
          'Only accounts the caller outranks (ADMIN: STAFF, STUDENT; SUPER_ADMIN: also ADMIN), and only to a ' +
          'role the caller may create, so nobody changes their own account here. Disabling ends every session ' +
          'and the user is refused on their next request. A role change applies from the next request. ' +
          'Logged as `auth.user.updated`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserRequest' } } },
        },
        responses: {
          200: { description: 'The updated account', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: errorResponse('Empty body, wrong types or unknown fields', 'VALIDATION_ERROR', 'Request body is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller does not outrank the account or the new role', 'FORBIDDEN', 'You do not have permission to perform this action'),
          404: errorResponse("No such user in the caller's school", 'NOT_FOUND', 'User not found'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/users/{id}/reset-password': {
      post: {
        tags: ['Users'],
        summary: 'Set a new password for a user who forgot theirs',
        description:
          'Same permission rule as PATCH. The admin passes the new password on to the user. Every session of ' +
          'the user ends, their access tokens are rejected, and any lockout is cleared. Logged as `auth.password.reset`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordRequest' } } },
        },
        responses: {
          204: { description: 'Password replaced' },
          400: errorResponse('New password missing, too short or too long', 'VALIDATION_ERROR', 'Request body is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller does not outrank the account', 'FORBIDDEN', 'You do not have permission to perform this action'),
          404: errorResponse("No such user in the caller's school", 'NOT_FOUND', 'User not found'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/users/{id}/unlock': {
      post: {
        tags: ['Users'],
        summary: 'Unlock an account locked by failed logins',
        description:
          'Same permission rule as PATCH. Resets the failed-login count and removes the lock. ' +
          'Logged as `auth.account.unlocked`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'Unlocked (also when the account was not locked)' },
          400: errorResponse('`id` is not a UUID', 'VALIDATION_ERROR', 'Request is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller does not outrank the account', 'FORBIDDEN', 'You do not have permission to perform this action'),
          404: errorResponse("No such user in the caller's school", 'NOT_FOUND', 'User not found'),
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the logged-in user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'The user the access token belongs to',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Me' } } },
          },
          401: {
            description:
              'No/malformed `Authorization` header (`UNAUTHORIZED`), bad signature or token revoked by logout / ' +
              'password change (`INVALID_TOKEN`), expired token (`TOKEN_EXPIRED`), or the user was ' +
              'deleted/disabled (`UNAUTHORIZED`)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' } },
              },
            },
          },
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/api/v1/auth/verify': {
      get: {
        tags: ['Auth'],
        summary: 'Resolve an access token to user identity (used by the gateway)',
        description:
          'The gateway calls this on every protected request and turns the result into the ' +
          '`x-user-id`, `x-user-role` and `x-tenant-id` headers it forwards. Identity and role are read ' +
          'from the database, so disabled or deleted users, revoked tokens and role changes take effect at once.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Token is valid and the user is active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Identity' } } },
          },
          401: {
            description: 'Same cases and codes as `GET /api/v1/auth/me`',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: { code: 'INVALID_TOKEN', message: 'Access token is invalid' } },
              },
            },
          },
          500: errorResponse('Unexpected server error', 'INTERNAL_ERROR', 'Internal server error'),
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: {
          200: {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'service'],
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'auth' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['tenant_id', 'email', 'password'],
        properties: {
          tenant_id: {
            type: 'string',
            format: 'uuid',
            description: 'The school the account belongs to',
            example: '11111111-1111-1111-1111-111111111111',
          },
          email: { type: 'string', format: 'email', maxLength: 255, example: 'admin@school.test' },
          password: {
            type: 'string',
            format: 'password',
            minLength: 1,
            description: 'At most 72 bytes (bcrypt limit)',
          },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string', maxLength: 128, description: 'From login or the last refresh' },
        },
      },
      TokenResponse: {
        type: 'object',
        required: ['access_token', 'refresh_token', 'token_type', 'expires_in'],
        properties: {
          access_token: {
            type: 'string',
            description: 'JWT (HS256). Claims: sub, role, tenant_id, iat, exp, jti',
          },
          refresh_token: {
            type: 'string',
            description: 'Opaque random string, valid 7 days. Store it securely; it is shown only once.',
          },
          token_type: { type: 'string', enum: ['Bearer'] },
          expires_in: { type: 'integer', description: 'Access token lifetime in seconds', example: 900 },
        },
      },
      Me: {
        type: 'object',
        required: ['id', 'email', 'role', 'tenant_id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'] },
          tenant_id: { type: 'string', format: 'uuid' },
        },
      },
      Identity: {
        type: 'object',
        required: ['id', 'role', 'tenant_id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'] },
          tenant_id: { type: 'string', format: 'uuid' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string', format: 'password' },
          new_password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            description: 'At least 8 characters, at most 72 bytes, different from the current one',
          },
        },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['new_password'],
        properties: {
          new_password: { type: 'string', format: 'password', minLength: 8, description: 'At least 8 characters, at most 72 bytes' },
        },
      },
      CreateUserRequest: {
        type: 'object',
        required: ['email', 'password', 'role'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email', maxLength: 255, example: 'student1@school.test' },
          password: { type: 'string', format: 'password', minLength: 8, description: 'At least 8 characters, at most 72 bytes' },
          role: { type: 'string', enum: ['ADMIN', 'STAFF', 'STUDENT'] },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'STAFF', 'STUDENT'] },
          is_active: { type: 'boolean', description: 'false disables the account and ends its sessions' },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'tenant_id', 'email', 'role', 'is_active', 'locked_until', 'created_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'] },
          is_active: { type: 'boolean' },
          locked_until: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Set only while a lockout is running',
          },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UserList: {
        type: 'object',
        required: ['data', 'page', 'limit', 'total'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', description: 'Accounts matching the filter, over all pages', example: 42 },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'INVALID_JSON',
                  'INVALID_CREDENTIALS',
                  'ACCOUNT_LOCKED',
                  'UNAUTHORIZED',
                  'INVALID_TOKEN',
                  'TOKEN_EXPIRED',
                  'INVALID_REFRESH_TOKEN',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'EMAIL_TAKEN',
                  'PAYLOAD_TOO_LARGE',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              details: {
                type: 'array',
                description: 'Only for VALIDATION_ERROR: one entry per invalid field',
                items: {
                  type: 'object',
                  properties: { field: { type: 'string' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
