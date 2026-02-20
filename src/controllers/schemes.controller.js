const { schemesService } = require('../services')

exports.crtSchemes = async(req, res) => {
    try {
        const schemes = await schemesService.createSchemes(req.body);
        res.status(201).json({success: true, data: schemes});
    } catch (error) {
        res.status(400).json({success:false, message: error.message})
    }
}

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const getProduct = await schemesService.getallSchemes(
      Number(page),
      Number(limit),
      search.trim()
    );

    res.status(200).json({ success: true, data: getProduct });
  } catch (err) {
    console.error("Get All Schemes Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getById = async(req, res) =>{
    try {
        const getAnm = await schemesService.getSchemesbyID(req.params.id);
    
        if (!getAnm) {
          return res
            .status(404)
            .json({ success: false, message: "Schemes not found" });
        }
    
        res.status(200).json({ success: true, data: getAnm });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
}

exports.UpdateSchemsbyID = async(req,res)=>{
    try {
        const updated = await schemesService.updateSchems(
            req.params.id,
            req.body
        );
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } 
}

exports.softdelete = async(req, res) =>{
  try {
    const deleted = await schemesService.deleteSchemes(req.params.id);
    res.json({ success: true, message: 'Scheme deleted successfully.', data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}