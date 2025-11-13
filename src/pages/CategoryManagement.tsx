import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Plus, Tag } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface Category {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export default function CategoryManagement() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryActive, setCategoryActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (userRole === "admin") {
      fetchCategories();
    }
  }, [userRole]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      // Try with 'active' first, then 'is_active'
      let { data, error } = await (supabase as any)
        .from("expense_categories")
        .select("id, name, active, created_at, created_by")
        .order("name", { ascending: true });

      if (error && (error as any).code === '42703') {
        const res2 = await (supabase as any)
          .from("expense_categories")
          .select("id, name, is_active, created_at, created_by")
          .order("name", { ascending: true });
        data = res2.data as any;
        error = res2.error as any;
        if (data) {
          data = data.map((cat: any) => ({
            ...cat,
            active: cat.is_active
          }));
        }
      }

      if (error) throw error;
      setCategories((data as Category[]) || []);
    } catch (e: any) {
      console.error("Failed to fetch categories:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to load categories",
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setCategoryName("");
    setCategoryActive(true);
    setSelectedCategory(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category);
    setCategoryName(category.name);
    setCategoryActive(category.active);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (category: Category) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!categoryName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Category name is required",
      });
      return;
    }

    try {
      setSaving(true);

      if (selectedCategory) {
        // Update existing category
        let { error } = await (supabase as any)
          .from("expense_categories")
          .update({
            name: categoryName.trim(),
            active: categoryActive,
          })
          .eq("id", selectedCategory.id);

        if (error && (error as any).code === '42703') {
          const res2 = await (supabase as any)
            .from("expense_categories")
            .update({
              name: categoryName.trim(),
              is_active: categoryActive,
            })
            .eq("id", selectedCategory.id);
          error = res2.error as any;
        }

        if (error) throw error;

        toast({
          title: "Category Updated",
          description: `${categoryName} has been updated successfully`,
        });
      } else {
        // Create new category
        let { error } = await (supabase as any)
          .from("expense_categories")
          .insert({
            name: categoryName.trim(),
            active: categoryActive,
            created_by: user?.id || null,
          });

        if (error && (error as any).code === '42703') {
          const res2 = await (supabase as any)
            .from("expense_categories")
            .insert({
              name: categoryName.trim(),
              is_active: categoryActive,
              created_by: user?.id || null,
            });
          error = res2.error as any;
        }

        if (error) throw error;

        toast({
          title: "Category Created",
          description: `${categoryName} has been created successfully`,
        });
      }

      setEditDialogOpen(false);
      setAddDialogOpen(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (e: any) {
      console.error("Failed to save category:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to save category",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;

    try {
      setDeleting(true);

      const { error } = await (supabase as any)
        .from("expense_categories")
        .delete()
        .eq("id", selectedCategory.id);

      if (error) throw error;

      toast({
        title: "Category Deleted",
        description: `${selectedCategory.name} has been deleted successfully`,
      });

      setDeleteDialogOpen(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (e: any) {
      console.error("Failed to delete category:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to delete category",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">Only administrators can access category management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Category Management</h1>
          <p className="text-muted-foreground">Manage expense categories for the system</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Categories</CardTitle>
          <CardDescription>All categories available for expense classification</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <div className="text-center py-8">Loading categories...</div>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No categories found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Name</TableHead>
                    <TableHead className="w-[20%]">Status</TableHead>
                    <TableHead className="w-[25%]">Created At</TableHead>
                    <TableHead className="text-right w-[20%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {category.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={category.active ? "default" : "secondary"}>
                        {category.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(category.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-[40px]"
                          onClick={() => openEditDialog(category)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="min-w-[40px]"
                          onClick={() => openDeleteDialog(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialogOpen || addDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditDialogOpen(false);
          setAddDialogOpen(false);
          setSelectedCategory(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              {selectedCategory ? "Update category details" : "Create a new expense category"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Travel, Food, Office Supplies"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="category-active">Active</Label>
              <Switch
                id="category-active"
                checked={categoryActive}
                onCheckedChange={setCategoryActive}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Inactive categories will not appear in the expense form dropdown
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setAddDialogOpen(false);
                setSelectedCategory(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !categoryName.trim()}>
              {saving ? "Saving..." : selectedCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category "{selectedCategory?.name}". 
              This action cannot be undone. Expenses using this category will still reference it, 
              but it will no longer be available for new expenses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

