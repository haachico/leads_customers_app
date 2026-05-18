const XLSX = require("xlsx");
const path = require("path");

// Create sample data
const data = [
  {
    name: "John Doe",
    email: "john@test.com",
    phone: "9876543210",
    company: "Acme Corp",
  },
  {
    name: "Sarah Smith",
    email: "sarah@test.com",
    phone: "9876543211",
    company: "Tech Inc",
  },
  {
    name: "Mike Johnson",
    email: "mike@test.com",
    phone: "",
    company: "StartUp Ltd",
  },
  {
    name: "Emma Wilson",
    email: "emma@test.com",
    phone: "9876543213",
    company: "Design Co",
  },
];

// Create workbook and worksheet
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

// Write to file
const filePath = path.join(__dirname, "test_leads.xlsx");
XLSX.writeFile(workbook, filePath);

console.log(`✅ Test Excel file created: ${filePath}`);
