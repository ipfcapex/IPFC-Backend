const { accountSectionService } = require("../services")

exports.addNote = async (req, res) => {
  try {
    const { id } = req.params; // comes from URL
    const { text, approvalStatus } = req.body; // comes from request body

    const updatedOrder = await accountSectionService.updateLastNoteService(id, text, approvalStatus);

    res.status(200).json({
      success: true,
      data: updatedOrder
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
