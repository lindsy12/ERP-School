// OpenAPI 3 description of notification-service, served at /api/v1/notifications/openapi.json
// and as Swagger UI at /api/v1/notifications/docs. Keep in sync with
// docs/api-contracts/notification-service.md.
const errorBody = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
};

const notification = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    eventType: { type: 'string', example: 'finance.payment.received' },
    title: { type: 'string', example: 'Payment received' },
    message: { type: 'string', example: 'Receipt: 75 000 FCFA received for invoice #3 by mobile money.' },
    read: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const errors = {
  401: { description: 'No identity (not called through the gateway, or no valid token)', content: { 'application/json': { schema: errorBody } } },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Notification Service',
    version: '1.0.0',
    description:
      'In-app notifications built from RabbitMQ events (exchange `erp.events`). Called through the gateway, ' +
      'which adds x-user-id / x-user-role / x-tenant-id. Staff see STAFF notifications; admins also see ADMINS ones.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  security: [{ bearer: [] }],
  paths: {
    '/api/v1/notifications': {
      get: {
        summary: 'My notifications, newest first',
        parameters: [
          { name: 'unread', in: 'query', schema: { type: 'boolean' }, description: 'Only unread ones' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: { 200: { description: 'List', content: { 'application/json': { schema: { type: 'array', items: notification } } } }, ...errors },
      },
    },
    '/api/v1/notifications/unread-count': {
      get: {
        summary: 'How many of my notifications are unread',
        responses: {
          200: { description: 'Count', content: { 'application/json': { schema: { type: 'object', properties: { unread: { type: 'integer' } } } } } },
          ...errors,
        },
      },
    },
    '/api/v1/notifications/{id}/read': {
      patch: {
        summary: 'Mark one notification as read (for me only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Marked' },
          400: { description: 'Bad id', content: { 'application/json': { schema: errorBody } } },
          404: { description: 'Not one of my notifications', content: { 'application/json': { schema: errorBody } } },
          ...errors,
        },
      },
    },
    '/api/v1/notifications/read-all': {
      post: {
        summary: 'Mark all my notifications as read',
        responses: {
          200: { description: 'Number newly marked', content: { 'application/json': { schema: { type: 'object', properties: { marked: { type: 'integer' } } } } } },
          ...errors,
        },
      },
    },
  },
};
