const { SellOrder, Order } = require("../models");
const mongoose = require("mongoose");
const { sendNotification } = require("./notificationService");

exports.updateLastNoteService = async (id, text, approvalStatus) => {
  const order = await SellOrder.findById(id)
    .populate("createdBy", "name email")
    .populate("customer", "name"); 

  if (!order) throw new Error("Order not found");

  const newNote = {
    text: text,
    by: "ACCOUNT_MANAGER"
  };

  // If no notes, add one
  if (!order.note || order.note.length === 0) {
    order.note = [newNote];
  } else {
    // Update the last note
    const lastIndex = order.note.length - 1;
    order.note[lastIndex] = newNote;
  }
  order.accountSectionApproval = approvalStatus;

  await order.save();

  const createdById = order.createdBy?._id
    ? String(order.createdBy._id)
    : order.createdBy
    ? String(order.createdBy)
    : null;
  const createdByName = order.createdBy?.name || null;
  const customerName = order.customer?.name || null;

  // 🔔 Send notifications based on approvalStatus
  let notifications = [];
  if (approvalStatus.toUpperCase() === "APPROVED") {
    const approveNotification = {
      message: `Order ${order.salesOrderNo}${customerName ? ` for ${customerName}` : ""} was Approved by Account Section.`,
      createdById,
      createdByName,
      salesOrderNo: order.salesOrderNo,
      data: order,
    };
    sendNotification("AccountSectionApproval", approveNotification);
    console.log("Approval Notification sent:", approveNotification);
    notifications.push(approveNotification);
  }

  if (approvalStatus.toUpperCase() === "REJECTED") {
    const rejectNotification = {
      message: `Order ${order.salesOrderNo}${customerName ? ` for ${customerName}` : ""} was Rejected by Account Section.${text ? ` Note: "${text}"` : ""}`,
      createdById,
      createdByName,
      salesOrderNo: order.salesOrderNo,
      data: order,
    };
    sendNotification("AccountSectionRejection", rejectNotification);
    console.log("Reject Notification sent:", rejectNotification);
    notifications.push(rejectNotification);
  }

  return { order, notifications };
};



