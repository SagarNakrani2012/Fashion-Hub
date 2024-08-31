const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const hbs = require("hbs");
const multer = require("multer");
const app = express();

// Middleware
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies
app.use(express.static(path.join(__dirname, "../public")));
const templatePath = path.join(__dirname, "../templates");
app.set("view engine", "hbs");
app.set("views", templatePath);
hbs.registerPartials(path.join(__dirname, "../templates/partials"));

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/clothingStore")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

// MongoDB Schemas
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  imageUrl: String,
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const orderSchema = new mongoose.Schema({
  name: String,
  mobileNumber: String,
  address: String,
  productName: String, // New field for product name
  totalAmount: Number,
  status: { type: String, default: 'Received' }, // Example status
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const User = mongoose.model("User", userSchema);
const Product = mongoose.model("Product", ProductSchema);


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/images");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Routes
app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/", (req, res) => {
  res.render("login");
});

app.get("/home",  (req, res) => {
  Product.find()
    .then((products) => {
      res.render("index", { products });
    })});



// Signup Route
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .render("signup", { message: "Username and password are required" });
  }

  try {
    const userExists = await User.findOne({ username });

    if (userExists) {
      return res
        .status(400)
        .render("signup", { message: "Username already exists" });
    }

    const newUser = new User({ username, password });
    await newUser.save();
    res.status(201).render("signup", { message: "User created successfully" });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation error", error: err.message });
    }

    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).render("login", { message: "User not found" });
    }

    if (user.password !== password) {
      return res
        .status(400)
        .render("login", { message: "Invalid credentials" });
    }

    res.status(200).render("index");
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.post("/upload-product", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;
  const imageUrl = req.file ? `/images/${req.file.filename}` : "";

  // Save the product data to MongoDB
  const newProduct = new Product({
    name,
    price,
    description,
    imageUrl,
  });

  newProduct
    .save()
    .then(() => res.render("admin", { respond: "Uploaded Successfully" }))
    .catch((err) =>
      res.status(500).send("Error uploading product: " + err.message)
    );
});

app.get("/products", (req, res) => {
  Product.find()
    .then((products) => {
      res.render("products", { products });
    })
    .catch((err) =>
      res.status(500).send("Error fetching products: " + err.message)
    );
});

let cart = [];

// Add to Cart Route
app.post("/add-to-cart", async (req, res) => {
  const { productId, quantity } = req.body;

  const product = await Product.findById(productId);

  cart.push({ product, quantity: parseInt(quantity) });

  // Redirect to the cart page after adding the product
  res.redirect("/cart");
});

app.get("/cart", (req, res) => {
  // Calculate the total amount in the cart
  let totalAmount = cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  // Render the cart page with the cart items and total amount
  res.render("cart", { cart, totalAmount });
});

app.post("/remove-from-cart", (req, res) => {
  const { productId } = req.body;

  // Find the index of the item in the cart array
  const itemIndex = cart.findIndex(
    (item) => item.product._id.toString() === productId
  );

  if (itemIndex > -1) {
    // Remove the item from the cart array
    cart.splice(itemIndex, 1);
  }

  // Recalculate the total amount
  const totalAmount = cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  // Render the updated cart page
  res.render("cart", { cart, totalAmount });
});

hbs.registerHelper("multiply", function (a, b) {
  return a * b;
});

// Route for rendering the fake payment gateway
app.get("/checkout", (req, res) => {
  const totalAmount = cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );
  res.render("fake-payment", { totalAmount });
});

// Route to handle payment processing
app.post("/process-payment", (req, res) => {
  const { name, mobileNumber, address} = req.body;
  
  // Assuming we have a single product in cart for simplicity
  const product = cart[0].product;
  const totalAmount = cart.reduce((total, item) => total + item.product.price * item.quantity, 0);

  // Create a new order
  const newOrder = new Order({
    name,
    mobileNumber,
    address,
    productName: product.name, // Set the product name
    totalAmount: totalAmount,  // Set the total amount
    status: "Paid",
  });

  newOrder.save()
    .then(() => {
      cart = []; // Clear the cart
      res.send('<h2>Payment Successful!</h2><p>Thank you for your purchase. Your order is being processed.</p><a href="/home">Back to Home</a>');
    })
    .catch((err) => res.status(500).send("Error processing order: " + err.message));
});

app.get("/admin", (req, res) => {
  Order.find()
    .then((orders) => {
      res.render("admin", { orders });
    })
    .catch((err) => res.status(500).send("Error fetching orders: " + err.message));
});



// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
