const { SellOrder, Order } = require("../models");
const mongoose = require("mongoose");
const { sendNotification } = require("./notificationService");

exports.updateLastNoteService = async (id, text, approvalStatus) => {
  const order = await SellOrder.findById({_id: id}); 

  if (!order) throw new Error("Order not found");
      let canApprove = true;

  const newNote = {
      text:text,
      by: "ACCOUNT_MANAGER"
    };
  // If no notes, add one
  if (!order.note || order.note.length === 0) {
    order.note = newNote;
     order.accountSectionApproval = approvalStatus
     
  } else {
    // Update the last note
    const lastIndex = order.note.length - 1;
    order.note[lastIndex] = newNote;
    order.accountSectionApproval = approvalStatus;
  }


  // 🔔 Send notifications based on approvalStatus
  let notifications = []
  if (approvalStatus.toUpperCase() === "APPROVED") {
    const approveNotification = {
      message: `Order ${order.salesOrderNo} Approved successfully by Account Section, Please review.`,
      data: order,
    };
    sendNotification("AccountSectionApproval", approveNotification);
    console.log("Approval Notification sent:", approveNotification);
    notifications.push(approveNotification);
  }

  if (approvalStatus.toUpperCase() === "REJECTED") {
    const rejectNotification = {
      message: `Order ${order.salesOrderNo} Rejected by Account Section, Please review.`,
      data: order,
    };
    sendNotification("AccountSectionRejection", rejectNotification);
    console.log("Reject Notification sent:", rejectNotification);
    notifications.push(rejectNotification);
  }

    
    // Update approval status
    // order. = canApprove ? "APPROVED" : "REJECTED";
    order.note[0] = newNote
  console.log("order",Order);

  await order.save();

  return {order, notifications};
};


