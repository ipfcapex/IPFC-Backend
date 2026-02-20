const Joi = require('joi');
const mongoose = require('mongoose');

// Factory creation
const createFactorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  // location: Joi.string().min(2).max(200).required()
});

// Factory update
const updateFactorySchema = Joi.object({
  name: Joi.string().min(2).max(100),
  // location: Joi.string().min(2).max(200)
}).min(1);

// ID validation (used in all routes by ID)
const idParamSchema = Joi.object({
  id: Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'ObjectId Validation').required()
});

// Optional query validation for hard delete
const deleteQuerySchema = Joi.object({
  hard: Joi.boolean().truthy('true').falsy('false')
});

module.exports = {
  createFactorySchema,
  updateFactorySchema,
  idParamSchema,
  deleteQuerySchema
};
