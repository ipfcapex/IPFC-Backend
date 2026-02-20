const { Announcement } = require("../models");

exports.createAnnouncement = async (data) => {
  const { title, description, role } = data;
  if (!title) {
    throw new Error("Announcement Title is require");
  }
  if (!description) {
    throw new Error("Announcement description is require");
  }

  const GenerateAnnouncement = await Announcement.create({
    title: title,
    description: description,
    role: role 
  });
  return GenerateAnnouncement;
};

exports.getallannouncement = async (page = 1, limit = 10, isActive = true, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const query = { isActive: true };

  // ✅ Apply search condition
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [
      { title: { $regex: regex } },
      { description: { $regex: regex } }
    ];
  }

  const [announcement, totalItems] = await Promise.all([
    Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Announcement.countDocuments(query),
  ]);

  const totalpages = Math.ceil(totalItems / limitNum);
  return {
    success: true,
    announcement,
    pagination: {
      currentPage: page,
      totalpages,
      totalItems,
    },
  };
};

exports.getAnnouncementByID = async (id) => {
  const getannouncement = await Announcement.findById(id);
  return getannouncement;
};

exports.UpdateAnnouncement = async (id, updatedData) => {
  
  const annaouncement = await Announcement.findByIdAndUpdate(id, updatedData, {
    new: true,
  });
  return annaouncement;
};

exports.softDeleteAnnouncement = async (id) => {
  const updatedAnnouncement = await Announcement.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true } // returns updated doc
  );

  if (!updatedAnnouncement) {
    throw new Error("Announcement not found");
  }

  return updatedAnnouncement;
};