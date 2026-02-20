const Joi = require('joi');

const registerValidation = Joi.object({
  name: Joi.string().min(3).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name should be at least 3 characters',
  }),

  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Email must be a valid email address',
  }),

  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be a valid 10-digit Indian number',
      'string.empty': 'Phone number is required',
    }),

  password: Joi.string().min(6).required().messages({
    'string.empty': 'Password is required',
    'string.min': 'Password must be at least 6 characters long',
  }),
    role: Joi.string()
    .valid('Admin', 'Administrator', 'Packing Reporter', 'Warehouse Manager', 'Inventory Manager', 'Sales Person', 'Account Section')
    .required(),
});

const changePasswordValidation = Joi.object({
  email: Joi.string().email().required(),
  oldPassword: Joi.string().min(6).required(),
  newPassword: Joi.string().min(6).required().messages({
      'any.only': 'Confirm password must match new password',
      'any.required': 'Confirm password is required',
    }),
  // password: Joi.any()
  //   .valid(Joi.ref('newPassword'))
  //   .required()
  //   .messages({
  //     'any.only': 'Confirm password must match new password',
  //     'any.required': 'Confirm password is required',
  //   }),
});

const createUserValidation = Joi.object({
  name: Joi.string().min(3).required(),
  email: Joi.string().email().required(),
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .message('Phone must be a valid 10-digit Indian number')
    .required(),
  password: Joi.string().min(6).required(),
  role: Joi.string()
    .valid(
      "Admin",
      "Administrator",
      "Packing Reporter",
      "Warehouse Manager",
      "Inventory Manager",
      "Sales Person",
      "Account Section"
    )
    .required(),
  location: Joi.string().required(), 
  profileImage: Joi.string().optional(), 
  // ✅ warehouses is optional if role is Warehouse Manager
  warehouses: Joi.when("role", {
  is: "Warehouse Manager",
  then: Joi.alternatives().try(
    Joi.array().items(Joi.string().hex().length(24)).optional(),
    // Joi.any().forbidden() // fallback if wrong
  ),
  
  // otherwise: Joi.forbidden()
}),
production: Joi.when("role", {
  is: "Packing Reporter",
  then: Joi.alternatives().try(
    Joi.array().items(Joi.string().hex().length(24)).optional(),
  ),
  
  // otherwise: Joi.forbidden()
}),
});

const updateUserValidator = Joi.object({
  name: Joi.string(),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/),
  password: Joi.string().min(6),
  role: Joi.string(),
  location: Joi.string(),
  profileImage: Joi.string(),
  isActive: Joi.boolean(),
  warehouses: Joi.string(),
  production: Joi.string(),
});

module.exports = {
  registerValidation,
  changePasswordValidation,
  createUserValidation,
  updateUserValidator
};
