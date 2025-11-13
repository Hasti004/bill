import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Save, Send } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { FileUpload } from "@/components/FileUpload";
import { ExpenseService, CreateExpenseData, UpdateExpenseData } from "@/services/ExpenseService";
import { z } from "zod";
// line items removed

const expenseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  destination: z.string().min(1, "Destination is required"),
  expense_date: z.date().refine(
    (date) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    },
    {
      message: "Expense date cannot be in the future. Please select a past date or today.",
    }
  ),
  purpose: z.string().optional(),
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
});

// Line items schema removed

export default function ExpenseForm() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [expense, setExpense] = useState({
    title: "",
    destination: "",
    expense_date: new Date(),
    purpose: "",
    amount: 0,
    category: "other",
  });
  // Line items state removed
  const [isEditing, setIsEditing] = useState(false);
  const [currentExpenseId, setCurrentExpenseId] = useState<string | null>(null);
  const [requiredFiles, setRequiredFiles] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        setLoadingCategories(true);
        const { data: catData } = await supabase
          .from('expense_categories')
          .select('name, active')
          .eq('active', true)
          .order('name');
        if (catData) setCategories(catData.map((c: any) => c.name));

        if (user?.id) {
          const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle();
          setIsAdmin(!!role);
        }
      } finally {
        setLoadingCategories(false);
      }
    };
    init();
    if (id && id !== "new") {
      fetchExpense();
      setIsEditing(true);
    }
  }, [id]);

  const fetchExpense = async () => {
    try {
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", id)
        .single();

      if (expenseError) throw expenseError;

      setExpense({
        title: expenseData.title,
        destination: expenseData.destination,
        expense_date: new Date(expenseData.trip_start),
        purpose: expenseData.purpose || "",
        amount: Number(expenseData.total_amount || 0),
        category: expenseData.category || "other",
      });

      setCurrentExpenseId(expenseData.id);

      // Fetch existing attachments for this expense
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("file_url")
        .eq("expense_id", id);

      if (!attachmentsError && attachmentsData) {
        // Load existing attachments into state
        const existingAttachmentUrls = attachmentsData
          .map(att => att.file_url)
          .filter(url => url) as string[];
        setAttachments(existingAttachmentUrls);
      }

      // no line items fetch
    } catch (error) {
      console.error("Error fetching expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load expense data",
      });
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      // Try inserting with 'active' first
      let { error } = await supabase
        .from('expense_categories')
        .insert({ name, active: true, created_by: user?.id || null });
      if (error && (error as any).code === '42703') {
        // Fallback to 'is_active'
        const res2 = await supabase
          .from('expense_categories')
          .insert({ name, is_active: true, created_by: user?.id || null });
        error = res2.error as any;
      }
      if (error) throw error;

      // Refresh categories list
      setCategories((prev) => Array.from(new Set([...
        prev,
        name
      ])));
      setNewCategoryName("");
      setAddCatOpen(false);
      toast({ title: 'Category added', description: `${name} has been added.` });
    } catch (e: any) {
      console.error('Failed to add category:', e);
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to add category' });
    }
  };

  const AddCategoryDialog = (
    <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="newCat">Category Name</Label>
          <Input id="newCat" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g., Travel" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddCatOpen(false)}>Cancel</Button>
          <Button onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // addLineItem removed

  const moveTempFilesToExpense = async (expenseId: string) => {
    try {
      if (!user?.id) {
        console.error('User not authenticated');
        return;
      }

      // Get all temp files for this user
      const { data: tempFiles, error: listError } = await supabase.storage
        .from('receipts')
        .list(`temp/${user.id}`, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) {
        console.error('Error listing temp files:', listError);
        return;
      }

      if (!tempFiles || tempFiles.length === 0) return;

      // Move each temp file to the expense folder
      for (const file of tempFiles) {
        const tempPath = `temp/${user.id}/${file.name}`;
        const newPath = `${expenseId}/${file.name}`;

        // Copy file to new location
        const { data: copyData, error: copyError } = await supabase.storage
          .from('receipts')
          .copy(tempPath, newPath);

        if (copyError) {
          console.error('Error copying file:', copyError);
          continue;
        }

        // Create attachment record
        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(newPath);

        await supabase
          .from('attachments')
          .insert({
            expense_id: expenseId,
            file_url: urlData?.publicUrl || '',
            filename: file.name || 'unknown',
            content_type: file.metadata?.mimetype || 'image/jpeg',
            uploaded_by: user.id
          });

        // Delete temp file
        await supabase.storage
          .from('receipts')
          .remove([tempPath]);
      }
    } catch (error) {
      console.error('Error moving temp files:', error);
    }
  };

  // line item handlers removed

  const saveExpense = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Validate expense data
      const validatedExpense = expenseSchema.parse({
        ...expense,
        expense_date: expense.expense_date,
      });

      // Check if bill photos are uploaded for submission
      if (!isEditing && attachments.length === 0) {
        // For new expenses, require attachments
        throw new Error("Bill photos are required for expense submission. Please upload at least one photo of your receipt or bill.");
      }
      
      // For editing, check if there are any attachments (existing in DB or new temp files)
      if (isEditing && id) {
        // Fetch current attachments count from database
        const { data: existingAttachments } = await supabase
          .from("attachments")
          .select("id")
          .eq("expense_id", id);
        
        // Check for temp files that will be moved
        const { data: tempFiles } = await supabase.storage
          .from('receipts')
          .list(`temp/${user.id}`, { limit: 100 });
        
        const existingCount = existingAttachments?.length || 0;
        const newTempFilesCount = tempFiles?.length || 0;
        const totalAttachments = existingCount + newTempFilesCount;
        
        if (totalAttachments === 0) {
          throw new Error("Bill photos are required for expense submission. Please upload at least one photo of your receipt or bill.");
        }
      }

      // Prepare data for ExpenseService
      // Use expense_date for both trip_start and trip_end since DB requires both
      const expenseDateStr = validatedExpense.expense_date.toISOString().split('T')[0];
      const expenseData: CreateExpenseData | UpdateExpenseData = {
        title: validatedExpense.title,
        destination: validatedExpense.destination,
        trip_start: expenseDateStr,
        trip_end: expenseDateStr,
        purpose: validatedExpense.purpose,
        amount: validatedExpense.amount,
        category: validatedExpense.category,
      };

      if (isEditing && id) {
        // Update existing expense
        await ExpenseService.updateExpense(id, user.id, expenseData);
        
        // Move any temp files to the expense folder (for newly uploaded files during edit)
        await moveTempFilesToExpense(id);
        
        // Submit the expense (this will handle status change to submitted)
        await ExpenseService.submitExpense(id, user.id);
      } else {
        // Create new expense
        const newExpense = await ExpenseService.createExpense(user.id, expenseData as CreateExpenseData);
        setCurrentExpenseId(newExpense.id);
        
        // Move temp files to the new expense folder
        await moveTempFilesToExpense(newExpense.id);
        
        // Submit the expense
        await ExpenseService.submitExpense(newExpense.id, user.id);
      }

      toast({
        title: "Success",
        description: "Expense submitted successfully",
      });

      navigate("/expenses");
    } catch (error: any) {
      console.error("Error saving expense:", error);
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        stack: error?.stack
      });
      
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: error.errors[0].message,
        });
      } else {
        // Provide more detailed error information
        let errorMessage = "Failed to save expense";
        if (error?.message) {
          errorMessage = error.message;
        } else if (error?.code) {
          errorMessage = `Database error (${error.code}): ${error.message || 'Unknown error'}`;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error, null, 2);
        }
        
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 max-w-4xl mx-auto">
      {/* Center-aligned Header */}
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {isEditing ? "Edit Expense" : "New Expense"}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          {isEditing ? "Update your expense details" : "Create a new expense claim"}
        </p>
      </div>

      <div className="flex justify-center">
        {/* Expense Details */}
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-center">Expense Details</CardTitle>
            <CardDescription className="text-center">Basic information about your expense</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={expense.title}
                onChange={(e) => setExpense({ ...expense, title: e.target.value })}
                placeholder="e.g., Office supplies purchase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">Vendor / Location *</Label>
              <Input
                id="destination"
                value={expense.destination}
                onChange={(e) => setExpense({ ...expense, destination: e.target.value })}
                placeholder="e.g., Amazon, New York, NY"
              />
            </div>

            <div className="space-y-2">
              <Label>Expense Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !expense.expense_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expense.expense_date ? format(expense.expense_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={expense.expense_date}
                    onSelect={(date) => date && setExpense({ ...expense, expense_date: date })}
                    initialFocus
                    disabled={(date) => {
                      // Disable all future dates (dates after today)
                      const today = new Date();
                      today.setHours(23, 59, 59, 999); // End of today
                      return date > today;
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                value={expense.purpose}
                onChange={(e) => setExpense({ ...expense, purpose: e.target.value })}
                placeholder="Describe the purpose of this expense..."
                rows={3}
              />
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={expense.amount || ""}
                onChange={(e) => setExpense({ ...expense, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={expense.category}
                  onValueChange={(val) => setExpense({ ...expense, category: val })}
                >
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue placeholder={loadingCategories ? 'Loading...' : 'Select a category'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <Button type="button" variant="outline" onClick={() => setAddCatOpen(true)}>Add</Button>
                )}
              </div>
              {!categories.length && (
                <p className="text-xs text-muted-foreground">No categories yet. {isAdmin ? 'Add one to get started.' : 'Please contact admin.'}</p>
              )}
            </div>
          </div>
          </CardContent>
        </Card>

        {/* Line Items removed from the creation form */}
      </div>

      {/* File Upload Section - Required for Submission */}
      <div className="mt-8 flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Bill Photos
              <span className="text-red-500 text-sm font-normal">* Required for submission</span>
            </CardTitle>
            <CardDescription>
              Upload photos of your receipts and bills. At least one photo is required to submit the expense.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorBoundary>
              <FileUpload 
                expenseId={currentExpenseId || id!} 
                onUploadComplete={(attachment) => {
                  if (attachment && attachment.file_url) {
                    setAttachments(prev => [...prev, attachment.file_url]);
                    toast({
                      title: "Bill photo uploaded",
                      description: "Photo has been attached to this expense",
                    });
                  }
                }}
                required={true}
              />
            </ErrorBoundary>
            {attachments.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-green-600 font-medium">
                  ✓ {attachments.length} bill photo{attachments.length > 1 ? 's' : ''} uploaded
                </p>
              </div>
            )}
            {attachments.length === 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ You must upload at least one bill photo to submit this expense.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit and Cancel Buttons - Full Width, Center-aligned */}
      <div className="flex flex-col gap-2 w-full max-w-2xl mx-auto">
        <Button
          onClick={() => saveExpense()}
          disabled={loading}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          Submit
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/expenses")}
          disabled={loading}
          className="w-full"
        >
          Cancel
        </Button>
      </div>

      {AddCategoryDialog}
    </div>
  );
}
