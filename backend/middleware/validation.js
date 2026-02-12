/**
 * Input Validation Middleware
 * Validates and sanitizes all inputs for security and data integrity
 */

import logger from '../utils/logger.js';

/**
 * Validate numeric value
 * @param {any} value - Value to validate
 * @param {object} options - Validation options
 * @returns {number} Validated number
 * @throws {Error} If validation fails
 */
export function validateNumber(value, options = {}) {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    required = false,
    fieldName = 'campo'
  } = options;

  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`${fieldName} es requerido`);
    }
    return null;
  }

  const num = Number(value);

  if (isNaN(num)) {
    throw new Error(`${fieldName} debe ser un número válido`);
  }

  if (num < min) {
    throw new Error(`${fieldName} debe ser mayor o igual a ${min}`);
  }

  if (num > max) {
    throw new Error(`${fieldName} debe ser menor o igual a ${max}`);
  }

  return num;
}

/**
 * Validate positive amount (for prices, payments, etc.)
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {number} Validated amount
 */
export function validateAmount(value, fieldName = 'monto') {
  return validateNumber(value, {
    min: 0,
    required: true,
    fieldName
  });
}

/**
 * Validate string value
 * @param {any} value - Value to validate
 * @param {object} options - Validation options
 * @returns {string} Validated string
 * @throws {Error} If validation fails
 */
export function validateString(value, options = {}) {
  const {
    minLength = 0,
    maxLength = 1000,
    required = false,
    pattern = null,
    fieldName = 'campo'
  } = options;

  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`${fieldName} es requerido`);
    }
    return null;
  }

  const str = String(value).trim();

  if (str.length < minLength) {
    throw new Error(`${fieldName} debe tener al menos ${minLength} caracteres`);
  }

  if (str.length > maxLength) {
    throw new Error(`${fieldName} no puede exceder ${maxLength} caracteres`);
  }

  if (pattern && !pattern.test(str)) {
    throw new Error(`${fieldName} tiene un formato inválido`);
  }

  return str;
}

/**
 * Validate email
 * @param {any} value - Email to validate
 * @param {boolean} required - Whether email is required
 * @returns {string|null} Validated email
 */
export function validateEmail(value, required = false) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!value && !required) {
    return null;
  }

  const email = validateString(value, {
    required,
    maxLength: 255,
    pattern: emailPattern,
    fieldName: 'email'
  });

  return email ? email.toLowerCase() : null;
}

/**
 * Validate UUID
 * @param {any} value - UUID to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {string} Validated UUID
 */
export function validateUUID(value, fieldName = 'ID') {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  return validateString(value, {
    required: true,
    pattern: uuidPattern,
    fieldName
  });
}

/**
 * Validate date
 * @param {any} value - Date to validate
 * @param {object} options - Validation options
 * @returns {Date|null} Validated date
 */
export function validateDate(value, options = {}) {
  const {
    required = false,
    minDate = null,
    maxDate = null,
    fieldName = 'fecha'
  } = options;

  if (!value) {
    if (required) {
      throw new Error(`${fieldName} es requerida`);
    }
    return null;
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} tiene un formato inválido`);
  }

  if (minDate && date < minDate) {
    throw new Error(`${fieldName} no puede ser anterior a ${minDate.toISOString().split('T')[0]}`);
  }

  if (maxDate && date > maxDate) {
    throw new Error(`${fieldName} no puede ser posterior a ${maxDate.toISOString().split('T')[0]}`);
  }

  return date;
}

/**
 * Validate enum value
 * @param {any} value - Value to validate
 * @param {array} allowedValues - Array of allowed values
 * @param {object} options - Validation options
 * @returns {string|null} Validated value
 */
export function validateEnum(value, allowedValues, options = {}) {
  const {
    required = false,
    fieldName = 'campo'
  } = options;

  if (!value) {
    if (required) {
      throw new Error(`${fieldName} es requerido`);
    }
    return null;
  }

  if (!allowedValues.includes(value)) {
    throw new Error(`${fieldName} debe ser uno de: ${allowedValues.join(', ')}`);
  }

  return value;
}

/**
 * Validate object against schema
 * @param {object} data - Data to validate
 * @param {object} schema - Validation schema
 * @returns {object} Validated data
 */
export function validateSchema(data, schema) {
  const validated = {};
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    try {
      const value = data[field];

      switch (rules.type) {
        case 'number':
          validated[field] = validateNumber(value, {
            min: rules.min,
            max: rules.max,
            required: rules.required,
            fieldName: field
          });
          break;

        case 'amount':
          validated[field] = validateAmount(value, field);
          break;

        case 'string':
          validated[field] = validateString(value, {
            minLength: rules.minLength,
            maxLength: rules.maxLength,
            required: rules.required,
            pattern: rules.pattern,
            fieldName: field
          });
          break;

        case 'email':
          validated[field] = validateEmail(value, rules.required);
          break;

        case 'uuid':
          validated[field] = validateUUID(value, field);
          break;

        case 'date':
          validated[field] = validateDate(value, {
            required: rules.required,
            minDate: rules.minDate,
            maxDate: rules.maxDate,
            fieldName: field
          });
          break;

        case 'enum':
          validated[field] = validateEnum(value, rules.allowedValues, {
            required: rules.required,
            fieldName: field
          });
          break;

        case 'boolean':
          if (rules.required && value === undefined) {
            throw new Error(`${field} es requerido`);
          }
          validated[field] = Boolean(value);
          break;

        default:
          validated[field] = value;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    const error = new Error('Errores de validación');
    error.validationErrors = errors;
    error.statusCode = 400;
    throw error;
  }

  return validated;
}

/**
 * Express middleware for request validation
 * @param {object} schema - Validation schema
 * @param {string} source - Source of data (body, query, params)
 * @returns {function} Express middleware
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = validateSchema(data, schema);
      req.validated = { ...req.validated, [source]: validated };
      next();
    } catch (error) {
      if (error.validationErrors) {
        return res.status(400).json({
          success: false,
          error: 'Errores de validación',
          details: error.validationErrors
        });
      }
      next(error);
    }
  };
}

/**
 * Sanitize string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
  if (!str) return str;
  
  return String(str)
    // Remove dangerous HTML tags
    .replace(/[<>]/g, '')
    // Remove javascript: and data: protocols
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove all event handlers (on* attributes)
    .replace(/\bon\w+\s*=/gi, '')
    .trim();
}

/**
 * Sanitize object recursively
 * @param {any} obj - Object to sanitize
 * @returns {any} Sanitized object
 */
export function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Express middleware to sanitize request data
 */
export function sanitizeRequest(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

export default {
  validateNumber,
  validateAmount,
  validateString,
  validateEmail,
  validateUUID,
  validateDate,
  validateEnum,
  validateSchema,
  validate,
  sanitizeString,
  sanitizeObject,
  sanitizeRequest
};
