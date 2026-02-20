const service = require('../services/billingOffice.service');

exports.createBillingOffice = async (req, res, next) => {
  try {
    const data = await service.create(req.body);
    console.log("data",data);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.getAllBillingOffice = async (req, res, next) => {
  try {
    const data = await service.getAll();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getOneBillingOffice = async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    if (!data) return res.status(404).json({ message: 'Not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateBillingOffice = async (req, res, next) => {
  try {
    const data = await service.update(req.params.id, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// exports.removeBillingOffice = async (req, res, next) => {
//   try {
//     await service.remove(req.params.id);
//     res.json({ message: 'Billing Office deleted' });
//   } catch (err) {
//     next(err);
//   }
// };
exports.removeBillingOffice = async (req, res, next) => {
  try {
    const deleted = await service.remove(req.params.id);
    res.json({ success: true, message: 'Billing Office soft deleted', data: deleted });
  } catch (err) {
    next(err);
  }
};