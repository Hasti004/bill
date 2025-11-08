import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileText, Image, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
}

interface FileUploadProps {
  expenseId: string;
  lineItemId?: string;
  onUploadComplete?: (attachment: Attachment) => void;
  onUploadError?: (error: string) => void;
  className?: string;
  required?: boolean;
}

export function FileUpload({ 
  expenseId, 
  lineItemId, 
  onUploadComplete, 
  onUploadError,
  className,
  required = false
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();


  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      
      // Validate file type and size according to spec
      const maxSize = 10 * 1024 * 1024; // 10MB as per spec
      if (file.size > maxSize) {
        throw new Error("File size must be less than 10MB");
      }

      // Only allow PNG, JPG for bill photos (images only)
      const allowedTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png'
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error("Only PNG and JPG image files are allowed for bill photos");
      }

      // Additional validation for file extensions (images only)
      const allowedExtensions = ['.png', '.jpg', '.jpeg'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!allowedExtensions.includes(fileExtension)) {
        throw new Error("Only PNG and JPG image files are allowed for bill photos");
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      // Handle case where expenseId is "new" or undefined
      const uploadPath = expenseId === "new" || !expenseId ? `temp/${user?.id}/${fileName}` : `${expenseId}/${fileName}`;

      // Upload file to Supabase Storage (use receipts bucket as primary)
      const bucketName = 'receipts';
      const uploadResult = await supabase.storage
        .from('receipts')
        .upload(uploadPath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadResult.error) {
        console.error('Storage upload error:', uploadResult.error);
        throw new Error(`Failed to upload file: ${uploadResult.error.message}`);
      }

      // Get public URL (use the same bucket that was used for upload)
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uploadPath);

      // Save attachment record to database (only if expenseId is not "new")
      let attachmentData = null;
      if (expenseId !== "new" && expenseId) {
        const { data, error: attachmentError } = await supabase
          .from('attachments')
          .insert({
            expense_id: expenseId,
            line_item_id: lineItemId,
            file_url: urlData.publicUrl,
            filename: file.name,
            content_type: file.type,
            uploaded_by: user?.id,
          })
          .select()
          .single();
        
        if (attachmentError) throw attachmentError;
        attachmentData = data;
      }

      // Create a temporary attachment object for new expenses
      const tempAttachment = {
        id: `temp-${Date.now()}`,
        filename: file.name,
        content_type: file.type,
        file_url: urlData.publicUrl,
        created_at: new Date().toISOString()
      };

      setAttachments(prev => [...prev, attachmentData || tempAttachment]);
      
      toast({
        title: "Upload successful",
        description: `${file.name} has been uploaded successfully`,
      });

      if (onUploadComplete) {
        onUploadComplete(attachmentData || tempAttachment);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      const errorMessage = error.message || "Failed to upload file";
      
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: errorMessage,
      });

      onUploadError?.(errorMessage);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    try {
      const attachment = attachments.find(a => a.id === attachmentId);
      if (!attachment) return;

      // Extract file path from URL
      const url = new URL(attachment.file_url);
      const filePath = url.pathname.split('/').slice(-2).join('/');

      // Delete from storage
      await supabase.storage
        .from('receipts')
        .remove([filePath]);

      // Delete from database
      await supabase
        .from('attachments')
        .delete()
        .eq('id', attachmentId);

      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      
      toast({
        title: "File deleted",
        description: `${attachment.filename} has been deleted`,
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "Failed to delete file",
      });
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Receipt Attachments
        </CardTitle>
        <CardDescription>
          Upload receipts and supporting documents for your expenses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Choose Files
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                or drag and drop bill photos here
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG only (max 10MB each)
                {required && (
                  <span className="text-red-500 font-medium"> * Required for submission</span>
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Supports: PNG, JPG image files only (max 10MB each)
            </p>
          </div>

          {uploading && (
            <div className="mt-4 space-y-2">
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          )}
        </div>

        {/* Attachments List */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Uploaded Files</h4>
            <div className="space-y-2">
              {attachments.filter(attachment => attachment).map((attachment) => (
                <div
                  key={attachment.id || Math.random()}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getFileIcon(attachment.content_type || 'image/jpeg')}
                    <div>
                      <p className="font-medium text-sm">{attachment.filename || 'Unknown file'}</p>
                      <p className="text-xs text-muted-foreground">
                        {attachment.content_type || 'Unknown type'} • {(() => {
                          try {
                            return attachment.created_at ? format(new Date(attachment.created_at), "MMM d, yyyy") : 'Unknown date';
                          } catch {
                            return 'Invalid date';
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImagePreviewUrl(attachment.file_url);
                        setImagePreviewOpen(true);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAttachment(attachment.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Image Preview Dialog */}
    <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
      <DialogContent className="max-w-3xl">
        {imagePreviewUrl && (
          <img src={imagePreviewUrl} alt="Attachment preview" className="w-full h-auto rounded" />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

