const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const openapiSpec = require('./docs/openapi');
const employeeRoutes = require('./routes/employee.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const leaveRoutes = require('./routes/leave.routes');
const payrollRoutes = require('./routes/payroll.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const assetRoutes = require('./routes/asset.routes');
const healthRoutes = require('./routes/health.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// helmet's default CSP adds 'upgrade-insecure-requests', which makes browsers try
// to load our own CSS/JS over https and fails on plain-http localhost.
const cspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
app.use(helmet({ contentSecurityPolicy: { directives: { ...cspDirectives, 'upgrade-insecure-requests': null } } }));
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.json());

app.use('/health', healthRoutes);

// HR's own frontend (plain HTML/CSS/JS, no build step). The gateway should proxy /hr/* here.
app.use('/hr', express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => res.redirect('/hr/'));

app.get('/api/v1/hr/openapi.json', (req, res) => res.json(openapiSpec));
// swagger-ui-express serves a page with inline scripts/styles, which the global CSP above
// (script-src/style-src 'self') would block — strip it for this one path only.
app.use('/api/v1/hr/docs', (req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); }, swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use('/api/v1/hr/employees', employeeRoutes);
app.use('/api/v1/hr/attendance', attendanceRoutes);
app.use('/api/v1/hr/leaves', leaveRoutes);
app.use('/api/v1/hr/payroll', payrollRoutes);
app.use('/api/v1/hr/dashboard', dashboardRoutes);
app.use('/api/v1/hr/assets', assetRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
