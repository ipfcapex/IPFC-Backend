const { Factory } = require("../models");

// const addFactory = async (data) => {
//   const existingfactory = await Factory.findOne({
//     name
//   });
//   if (existingfactory) throw new Error("Factory with this name already exists");

//   const factory = new Factory({
//     name,
//     location,
//   });
//   await factory.save();
//   return factory;
// };

const addFactory = async (data) => {
  // Destructure data
  const { name, location } = data;

  // 1. Check if factory name already exists
  const existingFactory = await Factory.findOne({ name: name.trim() });
  if (existingFactory) {
    throw new Error("Factory with this name already exists");
  }

  // 2. Create new factory
  const factory = new Factory({
    name: name.trim(),
    location, // expects array of location objects
  });

  // 3. Save to DB
  await factory.save();

  return factory;
};

const getAllFactories =async (page, limit, search = "" ) => {
  const skip = (page - 1) * limit;
  const query = { isActive: true }; // only non-deleted products

  if (search && search.trim() !== "") {
  const regex = new RegExp(search, "i");

  query.$or = [
    { name: regex }
  ];
}
    const [factories, totalItems] = await Promise.all([
    Factory.find(query).skip(skip).limit(limit).sort( {createdAt: -1} ),
    Factory.countDocuments(query)
  ]);
  
    const totalPages = Math.ceil(totalItems / limit);
  // console.log("factories",factories);
  
    return {
      factories,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems
      }
    };
  // return Factory.find();
};

const getFactoryById = async (id) => {
  return await Factory.findById(id);
};

const updateFactoryById = async (id, updates) => {
  const updated = await Factory.findByIdAndUpdate(id, updates, {
    new: true,
  });
  if (!updated) throw new Error("Factory not found");
  return updated;
};

const softDeleteFactoryById = async (id) => {
  const factory = await Factory.findByIdAndUpdate(
    id,
    {
      isActive: false,
    },
    {
      new: true,
    }
  );
  if (!factory) throw new Error("Factory not found");
  return factory;
};

const reactiveFactoryById = async (id) => {
  const factory = await Factory.findByIdAndUpdate(
    id,
    {
      isActive: true,
      updatedAt: new Date(),
    },
    {
      new: true,
    }
  );

  if (!factory) throw new Error("Factory not found");

  return factory;
};

module.exports = {
  addFactory,
  getAllFactories,
  getFactoryById,
  updateFactoryById,
  softDeleteFactoryById,
  reactiveFactoryById,
};
