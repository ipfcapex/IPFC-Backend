const mongoose = require('mongoose');

const Schemes = new mongoose.Schema({
    date: {
        type: String,
        default: () =>
            new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "2-digit",
                year: 'numeric'
            })
    },
    expireDate: {
        type: String,
        require: true
    },
    schemesName: {
        type: String,
        require: true
    },
    schemesDescription: {
        type: String,
        require: true
    },
    schemesType: {
        type: String,
        require: true
    },
    schemesQuantity: {
        type: Number,
        require: true
    },
    isActive: {
        type: Boolean,
        default: true,
    }
    
}, { timestamps: true })

module.exports = mongoose.model("Schemes",Schemes);