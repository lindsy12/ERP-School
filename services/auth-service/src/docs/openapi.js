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
      'Login, JWT issuing, refresh-token rotation, logout and the current user. Every error uses the same shape: ' +
      '`{ "error": { "code", "message", "details"? } }`.',
  },
  tags: [{ name: 'Auth' }, { name: 'Health' }],
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
          'Revokes every refresh token of that session. Repeating it succeeds. Access tokens already ' +
          'issued stay valid until they expire (at most 15 minutes).',
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
    '/api/v1/auth/users/{id}/unlock': {
      post: {
        tags: ['Auth'],
        summary: 'Unlock an account locked by failed logins (ADMIN, SUPER_ADMIN)',
        description:
          "Resets the failed-login count and removes the lock. Only users of the caller's own school " +
          '(tenant); others get 404. Logged as `auth.account.unlocked`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'Unlocked (also when the account was not locked)' },
          400: errorResponse('`id` is not a UUID', 'VALIDATION_ERROR', 'Request is invalid'),
          401: errorResponse('Missing or invalid access token', 'UNAUTHORIZED', 'Missing or malformed Authorization header'),
          403: errorResponse('Caller is not ADMIN or SUPER_ADMIN', 'FORBIDDEN', 'You do not have permission to perform this action'),
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
              'No/malformed `Authorization` header (`UNAUTHORIZED`), bad signature (`INVALID_TOKEN`), ' +
              'expired token (`TOKEN_EXPIRED`), or the user was deleted/disabled (`UNAUTHORIZED`)',
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
          '`x-user-id`, `x-user-role` and `x-tenant-id` headers it forwards. Also rejects users ' +
          'who were disabled or deleted after the token was issued.',
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
