import mongoose from "mongoose";

const { Schema } = mongoose;


const landingPageSchema = new Schema(
  {

    // =========================
    // Basic Information
    // =========================

    title: {
      type: String,
      required: true,
      trim: true,
    },


    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },


    // Main product
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },


    // Template system
    template: {
      type: String,
      default: "product-sale-1",
    },


    // draft / published
    status: {
      type: String,
      enum: [
        "draft",
        "published",
        "inactive"
      ],
      default: "draft",
      index: true,
    },



    // =========================
    // Hero Section
    // =========================

    hero: {

      headline: {
        type: String,
        trim: true,
      },


      subHeadline: {
        type: String,
        trim: true,
      },


      image: {
        type: String,
        default: "",
      },


      badge: {
        type: String,
        default: "",
      },


      buttonText: {
        type: String,
        default: "অর্ডার করুন",
      },


      buttonColor: {
        type: String,
        default: "#16a34a",
      },

    },



    // =========================
    // Video Section
    // =========================

    video: {

      enabled: {
        type: Boolean,
        default: false,
      },


      type: {
        type: String,
        enum:[
          "youtube",
          "facebook",
          "upload"
        ],
        default:"youtube",
      },


      url:{
        type:String,
        default:"",
      },


      thumbnail:{
        type:String,
        default:"",
      }

    },



    // =========================
    // Gallery
    // =========================

    gallery:[

      {
        image:{
          type:String,
          required:true,
        },

        title:{
          type:String,
          default:"",
        }

      }

    ],



    // =========================
    // Benefits Section
    // =========================

    benefits:[

      {

        icon:{
          type:String,
          default:"",
        },


        title:{
          type:String,
          trim:true,
        },


        description:{
          type:String,
          trim:true,
        }

      }

    ],



    // =========================
    // Features
    // =========================

    features:[

      {

        title:{
          type:String,
        },


        description:{
          type:String,
        }

      }

    ],




    // =========================
    // Customer Reviews
    // =========================

    reviewSection:{

      enabled:{
        type:Boolean,
        default:true,
      },


      title:{
        type:String,
        default:"আমাদের সন্তুষ্ট গ্রাহকরা",
      }

    },




    // =========================
    // Offer Section
    // =========================

    offer:{

      enabled:{
        type:Boolean,
        default:false,
      },


      title:{
        type:String,
        default:"",
      },


      oldPrice:{
        type:Number,
        default:0,
      },


      offerPrice:{
        type:Number,
        default:0,
      },


      discountText:{
        type:String,
        default:"",
      },


      countdown:{
        type:Date,
        default:null,
      }

    },




    // =========================
    // FAQ
    // =========================

    faq:[

      {

        question:{
          type:String,
        },


        answer:{
          type:String,
        }

      }

    ],




    // =========================
    // Order Form Settings
    // =========================

    orderForm:{

      enabled:{
        type:Boolean,
        default:true,
      },


      quantity:{
        type:Boolean,
        default:true,
      },


      paymentMethod:{
        type:Boolean,
        default:true,
      },


      shipping:{
        type:Boolean,
        default:true,
      }

    },




    // =========================
    // Analytics
    // =========================

    analytics:{

      views:{
        type:Number,
        default:0,
      },


      orders:{
        type:Number,
        default:0,
      },


      conversion:{
        type:Number,
        default:0,
      }

    },


    // admin info
    createdBy:{
      type:Schema.Types.ObjectId,
      ref:"User",
      default:null,
    }


  },

  {
    timestamps:true,
    collection:"landingPages"
  }

);



const LandingPage = mongoose.model(
  "LandingPage",
  landingPageSchema
);


export default LandingPage;