const { string } = require("joi");
const { customerService } = require("../services");
const { Customer } = require("../models");
const mongoose = require("mongoose");

const createCustomer = async (req, res) => {
  try {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).json({ success: true, message: "Customer created", data: customer });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAllUser = async (req, res) => {
  try {
        
    const personRole = req.query.personRole;
    console.log("personRole",personRole);
    
    const users = await customerService.getAllUser(personRole);
    console.log("users,users",users);
    
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default page 1
    const limit = parseInt(req.query.limit) || 10; // Default limit 10
      const search = (req.query.search || "").trim(); 
    const customersData = await customerService.getAllCustomers(page, limit, search);
    
    res.status(200).json({
      success: true,
      data: customersData.customers,
      pagination: customersData.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const getCustomerById = async (req, res) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Customer updated", data: customer });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    await customerService.deleteCustomer(req.params.id);
    res.status(200).json({ success: true, message: "Customer deleted" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getCustomerBySalesperson = async (req, res) => {
  try {
    // Ensure logged-in user exists
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    const salesPersonId = req.user.id || req.user._id;

    // Pagination setup
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Build base query
    const query = {
      salesPersonId: salesPersonId,
      isDeleted: false
    };

    // Search handling (like your getOrderDatabyWH)
    if (req.query.search && req.query.search.trim() !== "") {
  const search = req.query.search.trim();
  const regex = new RegExp(search, "i");
  const numericSearch = !isNaN(search) ? Number(search) : null;

  query.$or = [
    { name: regex },
    { email: regex },
    { location: regex },
    { $expr: { $regexMatch: { input: { $toString: "$phone" }, regex: regex } } },
    { country: regex },
    { note: regex }
  ];

  // Only add phone filter properly based on type
  if (numericSearch !== null) {
    query.$or.push({ phone: numericSearch });
  }
}

    // Fetch customers with pagination
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .select("name email phone location country note")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      customers,
    });

  } catch (error) {
    console.error("Error fetching customers by salesperson:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};



module.exports = {
  createCustomer,
  getAllCustomers,
  getAllUser,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerBySalesperson
};