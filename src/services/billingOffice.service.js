const { BillingOffice } = require('../models');
const { Warehouse } = require('../models');

exports.create = async (data) => {
//   const warehouses = await Warehouse.find({ _id: { $in: data.warehouseIds } });
//   if (warehouses.length !== data.warehouseIds.length) {
//     throw new Error('One or more warehouse IDs are invalid');
//   }
  return BillingOffice.create(data);
};

exports.getAll = () => BillingOffice.find().populate({
  path: 'warehouseIds',
  populate: { path: 'factoryIds', select: 'name' }
});

exports.getById = (id) => BillingOffice.findById(id).populate({
  path: 'warehouseIds',
  populate: { path: 'factoryIds', select: 'name' }
});

exports.update = async (id, data) => {
  const warehouses = await Warehouse.find({ _id: { $in: data.warehouseIds } });
  if (data.warehouseIds && warehouses.length !== data.warehouseIds.length) {
    throw new Error('Invalid warehouse ID(s)');
  }
  return BillingOffice.findByIdAndUpdate(id, data, { new: true });
};

exports.remove = (id) => {
  return BillingOffice.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
};