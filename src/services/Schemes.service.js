const { Schemes } = require("../models")

exports.createSchemes = async (data) => {
  const { schemesName, schemesType, schemesQuantity, schemesDescription,expireDate } = data;
  if (!schemesName) {
    throw new Error("schemesName is require");
  }
  if (!schemesType) {
    throw new Error("schemesType is require");
  }
  if (!schemesQuantity) {
    throw new Error("schemesQuantity is require");
  }
  if (!schemesDescription) {
    throw new Error("schemesDescription is require");
  }
  const GenerateScheme = await Schemes.create({
    schemesName: schemesName,
    schemesType: schemesType,
    schemesQuantity: schemesQuantity,
    schemesDescription: schemesDescription,
    expireDate: expireDate
  })
  return GenerateScheme
}

exports.getallSchemes = async (page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const query = { isActive: true };

  //Apply search condition
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [
      { schemesName: { $regex: regex } },
      { schemesDescription: { $regex: regex } },
      { schemesType: { $regex: regex } },
    ];
  }

  const [schemes, totalItems] = await Promise.all([
    Schemes.find(query).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
    Schemes.countDocuments(query),
  ]);

  const totalpages = Math.ceil(totalItems / limitNum);;
  return {
    success: true,
    schemes,
    pagination: {
      currentPage: page,
      totalpages,
      totalItems,
    }
  }
};

exports.getSchemesbyID = async (id) => {
  const getSchemes = await Schemes.findById(id);
  return getSchemes
}

exports.updateSchems = async (id, updateData) => {
  const updatedata = await Schemes.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  return updatedata
}

exports.deleteSchemes = async (id) => {
  const updatedScheme = await Schemes.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true } // returns updated doc
  );

  if (!updatedScheme) {
    throw new Error("Announcement not found");
  }

  return updatedScheme;
}