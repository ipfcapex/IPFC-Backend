const { Customer } = require("../models");
const { User } = require("../models");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const createCustomer = async (data) => {
  const { name, email, phone, location, country, note, salesPersonId } = data;

  if (!name || !phone || !salesPersonId) {
    throw new Error("Name, phone, and salesPersonId are required");
  }

  const salesPerson = await User.findById(salesPersonId);
  if (!salesPerson || salesPerson.role !== "Sales Person") {
    throw new Error("Invalid Sales Person");
  }
  // Check for existing customer by phone or email (if email is provided)
  const query = [{ phone }];
  if (email && email.trim() !== "") {
    query.push({ email });
  }

  const existing = await Customer.findOne({ $or: query });

  if (existing) {
    // More detailed duplicate message
    if (existing.phone === phone) {
      throw new Error("Customer with this phone number already exists");
    }
    if (existing.email === email) {
      throw new Error("Customer with this email already exists");
    }
  }

  const newCustomer = await Customer.create({
    name,
    email,
    phone,
    location,
    country,
    note,
    salesPersonId,
  });

  return newCustomer;
};

const getAllUser = async (personRole) => {

  // Find all users with the given role
  const salesPersons = await User.find({ role: personRole });
  console.log("salesPersons", salesPersons);
  return salesPersons
};

const getAllCustomers = async (page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  const query = { isDeleted: false }; // only non-deleted customers

  // Fetch all customers first
  let customers = await Customer.find(query)
    .populate("salesPersonId", "name email")
    .sort({ createdAt: -1 });

  // --- Single Search Function ---
  const applySearch = (items, searchText) => {
    if (!searchText || searchText.trim() === "") return items;
    const regex = new RegExp(searchText.trim(), "i");
    return items.filter(cust =>
      regex.test(cust.name || "") ||
      regex.test(cust.email || "") ||
      regex.test(cust.salesPersonId?.name || "") ||
      regex.test(cust.salesPersonId?.email || "")
    );
  };

  // Apply search
  const filteredCustomers = applySearch(customers, search);

  // Pagination logic
  const totalItems = filteredCustomers.length;
  const totalPages = Math.ceil(totalItems / limitNum);
  const skip = (pageNum - 1) * limitNum;
  const paginatedCustomers = filteredCustomers.slice(skip, skip + limitNum);

  return {
    customers: paginatedCustomers,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};

const getCustomerById = async (id) => {
  return await Customer.findById(id).populate(
    "salesPersonId",
    "name email phone"
  );
};

const updateCustomer = async (id, updateData, newImageFile) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid customer ID");
  }

  const customer = await Customer.findById(id);
  if (!customer) {
    throw new Error("Customer not found");
  }

  if (updateData.email) {
    const existingEmail = await Customer.findOne({
      email: updateData.email,
      _id: { $ne: id }, // Exclude self
    });
    if (existingEmail) {
      throw new Error("Email already in use by another customer");
    }
  }

  if (updateData.phone) {
    const existingPhone = await Customer.findOne({
      phone: updateData.phone,
      _id: { $ne: id }, // Exclude self
    });
    if (existingPhone) {
      throw new Error("Phone number already in use by another customer");
    }
  }

  if (newImageFile) {
    if (customer.profileImage && fs.existsSync(customer.profileImage)) {
      fs.unlinkSync(customer.profileImage); // Delete old image
    }
    updateData.profileImage = path.join("uploads", newImageFile.filename);
  }

  const updatedCustomer = await Customer.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  return {
    success: true,
    message: "Customer updated successfully",
    data: updatedCustomer,
  };
};

const deleteCustomer = async (id) => {
  const customer = await Customer.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true, runValidators: true }
  );

  if (!customer) throw new Error("Customer not found");

  return customer;
};

module.exports = {
  createCustomer,
  getAllUser,
  updateCustomer,
  getAllCustomers,
  getCustomerById,
  deleteCustomer,
};
