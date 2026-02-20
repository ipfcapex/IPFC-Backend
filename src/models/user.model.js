const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { Log } = require('../models');

const roles = [
  'Admin',
  'Administrator',
  'Packing Reporter',
  'Warehouse Manager',
  'Inventory Manager',
  'Sales Person',
  'Account Section',
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 3,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please fill a valid email address',
      ],
    },
    phone: {
      type: Number,
      required: [true, 'Phone number is required'],
      match: [
        /^[6-9]\d{9}$/,
        'Phone number must be a valid 10-digit Indian mobile number',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [9, 'Password must be at least 9 characters long'],
      select: false,
      validate: {
        validator: function (value) {
          // Length check
          if (value.length < 9) {
            throw new Error('Password must be at least 9 characters long.');
          }

          // Uppercase check
          if (!/[A-Z]/.test(value)) {
            throw new Error('Password must include at least one uppercase letter.');
          }

          // Lowercase check
          if (!/[a-z]/.test(value)) {
            throw new Error('Password must include at least one lowercase letter.');
          }

          // Number check
          if (!/\d/.test(value)) {
            throw new Error('Password must include at least one number.');
          }

          // Special character check
          if (!/[@$!%*?&]/.test(value)) {
            throw new Error(
              'Password must include at least one special character (@, $, !, %, *, ?, &).'
            );
          }

          return true; // Valid password
        },
        message: (props) => props.reason?.message || 'Invalid password format.',
      },
    },

    role: {
      type: String,
      enum: roles
    },
    // ✅ Multi-select warehouse field (only applies if role = "Warehouse Manager")
    warehouses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Warehouse",
      },
    ],
     production: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Production",
      },
    ],
    location: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDoubleVerifiedChecked: {
      type: Boolean,
      default: false,
    },
    isPasswordChanged: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: {
      type: Date,
    },
    profileImage: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare passwords
userSchema.methods.isPasswordMatch = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};


module.exports = mongoose.model('User', userSchema);
