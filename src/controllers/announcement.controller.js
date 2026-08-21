const { announcementService } = require("../services");

exports.createAnnouncements = async (req, res) => {
  try {
    const announcement = await announcementService.createAnnouncement(req.body);
    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAllAnnouncements = async (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const isActive = req.query.isActive !== "false";
    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const search = (rawSearch === "undefined" || rawSearch === "null") ? "" : rawSearch;

    const getProduct = await announcementService.getallannouncement(
      page,
      limit,
      isActive,
      search
    );
    res.status(200).json({ success: true, data: getProduct });
  } catch (err) {
    console.error("Get All Announcements Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getByIDAnnouncement = async (req, res) => {
  try {
    const getAnm = await announcementService.getAnnouncementByID(req.params.id);

    if (!getAnm) {
      return res
        .status(404)
        .json({ success: false, message: "Announcement not found" });
    }

    res.status(200).json({ success: true, data: getAnm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAnnouncementController = async (req, res) => {
  try {
    const updated = await announcementService.UpdateAnnouncement(
      req.params.id,
      req.body
    );
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletedAnnouncement = async (req, res) => {
  try {
    const deleted = await announcementService.softDeleteAnnouncement(req.params.id);
    res.json({ success: true, message: 'Announcement was deleted successfully.', data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};