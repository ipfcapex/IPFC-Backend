const Joi = require('joi');
const objectId = require('./custom.validation');

exports.createOrder = Joi.object({
  customer: objectId,
  warehouse: objectId,
  items: Joi.array().items(Joi.object({
    productId: objectId,
    quantity: Joi.number().min(1).required(),
    price: Joi.number().optional()
  })),
  status: Joi.string().valid('draft', 'preorder', 'final'),
  notes: Joi.string().optional()
});

exports.updateOrder = Joi.object({
  status: Joi.string().valid('draft', 'preorder', 'final'),
  notes: Joi.string().optional(),
  items: Joi.array().optional(),
});
