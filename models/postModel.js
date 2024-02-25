const mongoose = require("mongoose");
const postSchema = mongoose.Schema(
    {
        title:{
            type: String,
            required: [true, "Please enter post title"]
        },
        body:{
            type: String,
            required: [true, "Please enter post body"]
        },
        author:{
            type: String,
            required: true
    }
    },
    {
        timestamps: true
    }
)

const Post = mongoose.model('Post', postSchema);

module.exports = Post;