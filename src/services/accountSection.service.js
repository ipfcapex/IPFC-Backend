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
    // Approved: notify with sales person name, customer name and a message.
    const approveNotification = {
      message: `${createdByName || "Sales Person"} - Customer ${customerName || "N/A"}: Order ${order.salesOrderNo} was Approved by Account Section.`,
      createdById,
      createdByName,
      customerName,
      salesOrderNo: order.salesOrderNo,
      data: order,
    };
    sendNotification("AccountSectionApproval", approveNotification);
    console.log("Approval Notification sent:", approveNotification);
    notifications.push(approveNotification);
  }

  if (approvalStatus.toUpperCase() === "REJECTED") {
    // Rejected: notify with sales person name, order number, customer name and reason.
    const rejectNotification = {
      message: `${createdByName || "Sales Person"} - Customer ${customerName || "N/A"}: Order ${order.salesOrderNo} was Rejected by Account Section.${text && text.trim() ? ` Reason: ${text.trim()}` : ""}`,
      createdById,
      createdByName,
      customerName,
      salesOrderNo: order.salesOrderNo,
      data: order,
    };
    sendNotification("AccountSectionRejection", rejectNotification);
    console.log("Reject Notification sent:", rejectNotification);
    notifications.push(rejectNotification);
  }

  return { order, notifications };
};



