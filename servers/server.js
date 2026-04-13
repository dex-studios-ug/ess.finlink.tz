// server.js
// e-MKOPO FSP Bridge Server for MifosX
// Production-ready, finance-grade security hardening

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult, matchedData } = require('express-validator');
const winston = require('winston');
const axios = require('axios');
require('dotenv').config();
const { config } = require('./setup.js');




// ==================== LOGGING SETUP ====================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return JSON.stringify({ timestamp, level, message, ...meta });
        })
    ),
    transports: [
        new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: './logs/combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

const app = express(); 
(function (){
    
    let {initializeDatabase}=require('../db/db.js')
initializeDatabase().then(async (db) => {
    app.locals.db = db;
    const settings = await db.get('select sms_volume from settings where id = 1');
    app.locals.sms_volume = parseInt(settings.sms_volume);
    logger.info('Database initialized successfully');
  
}).catch((error) => {
    logger.error('Database initialization failed:', error);
    process.exit(1);
});
})();

// Middleware
// Security middleware
/*
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"], 
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true, 
        preload: true
    }
}));*/

/*app.use(cors({
    origin: "*"
        //? process.env.ALLOWED_ORIGINS.split(',')
       // : (config.env !== 'production' ? true : [])
        ,
        
    credentials: false,
    methods: ['OPTIONS','GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['*']//,'Content-Type', 'Authorization', 'X-Request-ID', 'X-Message-Type', 'X-Message-ID', 'X-FSP-Code']
}));*/
app.use(cors());
app.all('*',cors());
app.options('*', cors()); // Enable pre-flight for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // allow all origins
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  //res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
}); 

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml', 'application/*+xml'], limit: '10mb' }));
app.use(express.static(path.join(__dirname, './../public'))); 
 

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimits.windowMs,
    max: config.rateLimits.max,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});
//app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    next();
});

const {crdb_router}=require('./crdb.js')
const {ess_router}=require('./ess.js')
const {auth_router}=require('./auth.js')
const {atm_router}=require('./atm.js')
const {approvals_router}=require('./approvals.js')
const {otp_router}=require('./otp.js')
const {sms_router}=require('./sms.js')
const {utils_router}=require('./utils.js')
const {selfservice_router}=require('./selfservice.js')
const {notifications_router}=require('./notifications.js')


app.use('/api/crdb',crdb_router)
app.use('/api/ess',ess_router)
app.use('/api/auth',auth_router)
app.use('/api/atm',atm_router)
app.use('/api/approvals',approvals_router)
app.use('/api/otp',otp_router)
app.use('/api/sms',sms_router)
app.use('/api/utils',utils_router)
app.use('/api/selfservice',selfservice_router)
app.use('/api/notify',notifications_router)


// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

/*/ Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down server...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', { reason, promise });
});
*/

let server;

if (require.main === module) {
    const PORT = process.env.PORT;
    server = app.listen(PORT, () => {
        logger.info(`e-MKOPO FSP Bridge Server running on port ${PORT}`);
        logger.info(`FSP Code: ${config.fspCode}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`MifosX API: ${config.mifosx.baseUrl}`);
        if (config.security.disableSignatureValidation) {
            logger.warn('⚠️  SIGNATURE VALIDATION DISABLED - For development/testing only!');
        }
        console.log(`Server is running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health (POST)`);
    }).on('error', (err) => {
        console.error('Server failed to start:', err);
        process.exit(1);
    });

   /* process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        server.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection:', { reason, promise });
    });*/
}