import LandingPage from "../model/landingPage.model.js";
import Product from "../model/product.model.js";


// ======================================
// ADMIN: CREATE LANDING PAGE
// ======================================

export const createLandingPage = async (req, res) => {

  try {

    const {
      title,
      slug,
      product,
      template,
      hero,
      video,
      gallery,
      benefits,
      features,
      reviewSection,
      offer,
      faq,
      orderForm
    } = req.body;



    // check product exists

    const existingProduct = await Product.findById(product);

    if(!existingProduct){
      return res.status(404).json({
        message:"Product not found"
      });
    }



    // duplicate slug check

    const existingSlug = await LandingPage.findOne({
      slug
    });


    if(existingSlug){

      return res.status(400).json({
        message:"Slug already exists"
      });

    }



    const landingPage = await LandingPage.create({

      title,
      slug,
      product,

      template:
      template || "product-sale-1",

      hero,
      video,
      gallery,
      benefits,
      features,
      reviewSection,
      offer,
      faq,
      orderForm,

      createdBy:req.user?._id

    });



    res.status(201).json({

      message:"Landing page created successfully",

      landingPage

    });


  } catch(error){

    console.log(error);

    res.status(500).json({

      message:"Failed to create landing page",

      error:error.message

    });

  }

};





// ======================================
// ADMIN: GET ALL LANDING PAGES
// ======================================


export const getAllLandingPages = async(req,res)=>{


try{


const pages = await LandingPage
.find()
.populate(
 "product",
 "productName price productImage"
)
.sort({
 createdAt:-1
});



res.status(200).json(pages);



}catch(error){


res.status(500).json({

message:"Failed to fetch landing pages",

error:error.message

});


}


};







// ======================================
// ADMIN: GET SINGLE LANDING PAGE
// ======================================


export const getLandingPageById = async(req,res)=>{


try{


const page =
await LandingPage
.findById(req.params.id)
.populate("product");



if(!page){

return res.status(404).json({

message:"Landing page not found"

});

}



res.status(200).json(page);



}catch(error){

res.status(500).json({

message:"Failed to fetch landing page",

error:error.message

});

}


};







// ======================================
// PUBLIC: GET BY SLUG
// ======================================


export const getLandingPageBySlug = async(req,res)=>{


try{


const page =
await LandingPage
.findOne({

slug:req.params.slug,

status:"published"

})
.populate({

path:"product",

select:
"productName price regularPrice productImage details ratingAvg ratingCount delivery"

});



if(!page){

return res.status(404).json({

message:"Landing page not found"

});

}




// increase views

await LandingPage.findByIdAndUpdate(

page._id,

{
$inc:{
"analytics.views":1
}
}

);



res.status(200).json(page);



}catch(error){


res.status(500).json({

message:"Failed to load landing page",

error:error.message

});


}


};








// ======================================
// ADMIN: UPDATE LANDING PAGE
// ======================================


export const updateLandingPage = async(req,res)=>{


try{


const updatedPage =

await LandingPage.findByIdAndUpdate(

req.params.id,

req.body,

{
new:true,
runValidators:true
}

);



if(!updatedPage){

return res.status(404).json({

message:"Landing page not found"

});

}



res.status(200).json({

message:"Landing page updated",

landingPage:updatedPage

});



}catch(error){


res.status(500).json({

message:"Update failed",

error:error.message

});


}


};








// ======================================
// ADMIN: DELETE LANDING PAGE
// ======================================


export const deleteLandingPage = async(req,res)=>{


try{


const deleted =

await LandingPage.findByIdAndDelete(
req.params.id
);



if(!deleted){

return res.status(404).json({

message:"Landing page not found"

});

}



res.status(200).json({

message:"Landing page deleted"

});



}catch(error){


res.status(500).json({

message:"Delete failed",

error:error.message

});


}


};








// ======================================
// ADMIN: PUBLISH / UNPUBLISH
// ======================================


export const updateLandingStatus = async(req,res)=>{


try{


const {
status
}=req.body;



const page =

await LandingPage.findByIdAndUpdate(

req.params.id,

{
status
},

{
new:true
}

);



res.status(200).json({

message:"Status updated",

page

});


}catch(error){


res.status(500).json({

message:"Status update failed",

error:error.message

});


}


};