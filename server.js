const express = require("express");
const app = express();
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const session = require("express-session");
const flash = require("express-flash");
const passport = require("passport");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Post = require("./models/postModel");
const initializePassport = require("./passportConfig");
const axios = require("axios");
mongoose.connect("mongodb+srv://admin:12345@crudapi.avikayl.mongodb.net/crud-api?retryWrites=true&w=majority")
initializePassport(passport);

const PORT = process.env.PORT || 4000;
app.set("view engine", "ejs");
app.use(express.urlencoded({extended: false}));
app.use(session({
        secret: "secret", 

        resave: false,

        saveUninitialized: false
    })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.get("/",(req, res)=>{
    res.render("index", {dates :[], closingPrices:[], openingPrices:[], symbol:[] });
});

app.get("/getData",(req, res)=>{
    const apiKey = "FTCPYAZA3IRZ2UZ9";
    symbol = req.query.symbol;
    axios.get(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`)
    .then(response => {
        const timeSeriesData = response.data["Time Series (Daily)"];
        const dates = Object.keys(timeSeriesData);
        const openingPrices = dates.map(date => parseFloat(timeSeriesData[date]["1. open"]));
        const closingPrices = dates.map(date => parseFloat(timeSeriesData[date]["4. close"]));
        res.render("index", { dates, closingPrices, openingPrices, symbol });
    })
    .catch(error => {
        console.log("Error fetching data from Alpha Vantage API:", error);
        res.render("index", {dates :[], closingPrices:[], openingPrices:[], symbol:[] });
    });
});

app.get("/register", checkAuthenticated, (req, res)=>{
    res.render("register");
});

app.get("/login", checkAuthenticated, (req, res)=>{
    res.render("login");
});

app.get("/dashboard", checkNotAuthenticated, async(req, res)=>{
    try {
        const posts = await Post.find({});
        const newsAPIKey = "c4adcbeb251c41ff89efde708d9680ce";
        axios.get(`https://newsapi.org/v2/top-headlines?sources=bbc-news&apiKey=${newsAPIKey}`)
        .then(response => {
            const articles = response.data.articles;
            res.render("dashboard", {user: req.user.name, posts, articles });
        });
    } 
    catch (error) {
        res.status(500).json({message: error.message})
    }
});


app.get("/logout", (req, res)=>{
    req.logout(function(err){
        if(err){
            return next(err);
        }
        req.flash("success_msg", "You have logged out");
        res.redirect("/");
    });
});

app.get('/admin', isNotAdmin, (req, res) => {
    res.render('admin', {user: req.user.name, recipes: [] });
});

app.get("/admin/searchRecipes", (req, res) => {
    const apiKey = "1bd1c2d5a2f645b5884810bc4350c03a";
    const query = req.query.query; 
    const number = 3;

    axios.get(`https://api.spoonacular.com/recipes/search?query=${query}&number=${number}&apiKey=${apiKey}`)
        .then(response => {
            const recipes = response.data.results;
            res.render("admin", { user: req.user.name, recipes });
        })
        .catch(error => {
            console.log("Error fetching recipe data from Spoonacular API:", error);
            res.render("admin", { user: req.user.name, recipes: [] });
        });
});

app.post('/register', async (req, res)=>{
    let { name, email, password, password2, isAdmin } = req.body;
    let role = isAdmin ? true : false;
    console.log({
        name, email, password, password2, role
    });

    let errors = [];

    if(!name || !email || !password || !password2){
        errors.push({message: "Please enter all fields"});
    }

    if(password.length < 6){
        errors.push({message: "The password should be at least 6 characters"});
    }

    if(password != password2){
        errors.push({message: "Passwords do not match"});
    }

    if(errors.length > 0){
        res.render('register', {errors});
    }
    else{
        // Form validation has passed

        let hashedPassword = await bcrypt.hash(password, 10);
        console.log(hashedPassword);

        pool.query(
            'SELECT * FROM users WHERE email = $1', [email], (err, results) =>
            {
                if (err){
                    throw err
                }
                console.log(results.rows);

                if(results.rows.length > 0){
                    errors.push({message: "Email already registered"});
                    res.render("register", {errors});
                }
                else{
                    pool.query(
                        'INSERT INTO users (name, email, password, isadmin) VALUES($1, $2, $3, $4) RETURNING id, password',
                        [name, email, hashedPassword, role], 
                        async (err, results) =>{
                            if (err){
                                throw err
                            }
                            console.log(results.rows);
                            try {
                                let transporter = nodemailer.createTransport({
                                    service: 'gmail',
                                    auth: {
                                        user: 'recoverymail30942@gmail.com', 
                                        pass: 'gdvi bgxt slqq ubif'
                                    }
                                });
                        
                                let mailOptions = {
                                    from: 'recoverymail30942@gmail.com', 
                                    to: email, 
                                    subject: 'Successful Registration', 
                                    text: 'Hello, ' + name + '! You have successfully registered your account!'
                                };
                        
                                let info = await transporter.sendMail(mailOptions);
                                console.log('Email sent: ', info.response);
                            } catch (error) {
                                console.error('Error occurred while sending email: ', error);
                                res.status(500).send('Failed to send email. Please try again later.');
                            }
                            req.flash("success_msg", "You are now registered. Please log in");
                            res.redirect("/login");
                        }
                    )
                }
            }
        );
    }
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/dashboard", 
    failureRedirect: "/login",
    failureFlash: true
    })
);

app.post('/admin/addPost', async(req, res) =>{
    const { postTitle, postBody} = req.body;
    try {
        const newPost = new Post({
            title: postTitle,
            body: postBody,
            author: req.user.name
        });
        await newPost.save();
        try {
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'recoverymail30942@gmail.com', 
                    pass: 'gdvi bgxt slqq ubif'
                }
            });
    
            let mailOptions = {
                from: 'recoverymail30942@gmail.com', 
                to: req.user.email, 
                subject: 'Post created', 
                text: 'Hello, ' + req.user.name + '! You have successfully created post!'
            };
    
            let info = await transporter.sendMail(mailOptions);
            console.log('Email sent: ', info.response);
        } catch (error) {
            console.error('Error occurred while sending email: ', error);
            res.status(500).send('Failed to send email. Please try again later.');
        }
        res.redirect('/admin'); 
    } 
    catch (error) {
        res.status(500).json({message: error.message})
    }
})


app.post('/admin/editPost', async(req, res) =>{
    const { postID, newBody } = req.body;
    try {
        const updatedPost = await Post.findByIdAndUpdate(postID, { body: newBody }, { new: true });
        if(!updatedPost){
            return res.status(404).json({message: 'cannot find any post with ID '+postID})
        }
        res.redirect('/admin'); 
    } 
    catch (error) {
        res.status(500).json({message: error.message})
    }
})

app.post('/admin/deletePost', async(req, res) =>{
    const { postIDforDelete } = req.body;
    try {
        const post = await Post.findByIdAndDelete(postIDforDelete);
        if(!post){
            return res.status(404).json({message: 'cannot find any post with ID '+postIDforDelete})
        }
        res.redirect('/admin'); 
    } 
    catch (error) {
        res.status(500).json({message: error.message})
    }
})

function isNotAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isadmin === true) {
        return next();
    }
    res.redirect('/dashboard');
}

function checkAuthenticated(req, res, next){
    if (req.isAuthenticated()){
        return res.redirect("/dashboard");
    }
    next();
}

function checkNotAuthenticated(req, res, next){
    if (req.isAuthenticated()){
        return next();
    }
    res.redirect("/login")
}

app.listen(PORT, ()=>{
    console.log('Server running on port ' + PORT);
});