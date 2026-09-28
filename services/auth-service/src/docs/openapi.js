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
      'Login, JWT issuing and the current user. Every error uses the same shape: ' +
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
          'so the response never reveals which emails are registered.',
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
                  'UNAUTHORIZED',
                  'INVALID_TOKEN',
                  'TOKEN_EXPIRED',
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
