const { body } = require('express-validator');

exports.validateProduct = [
  body('factory').notEmpty().withMessage('Factory is required'),
  body('article').notEmpty().withMessage('Article is required'),
  body('productionDate').isISO8601().withMessage('Valid production date is required'),
  body('productionQuantity').isNumeric().withMessage('Production quantity must be a number'),
];
