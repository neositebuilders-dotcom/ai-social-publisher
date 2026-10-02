import { EmptyState, Loading, PageHeader } from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Kind = "text" | "image" | "carousel" | "story" | "short_video";

export default function Media() {
  const assets = useQuery(api.media.list);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const createFromUpload = useMutation(api.media.createFromUpload);
  const createFromUrl = useMutation(api.media.createFromUrl);
  const remove = useMutation(api.media.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Kind>("image");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (assets === undefined) return <Loading label="Loading media…" />;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };
      await createFromUpload({
        storageId: storageId as never,
        name: name || file.name,
        kind,
      });
      toast.success("Asset uploaded");
      setOpen(false);
      setName("");
      setUrl("");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader
        title="Media library"
        description="Reusable visuals for your posts. Uploads are stored in Convex file storage; external URLs are referenced directly by the platform adapters."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Upload className="size-4" />
            Add media
          </Button>
        }
      />

      {assets.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media yet"
          description="Add an image or video URL, or upload a file. Media is attached to the posts that require it."
          action={
            <Button onClick={() => setOpen(true)}>
              <Upload className="size-4" />
              Add media
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset._id} className="overflow-hidden border-border/70 shadow-none">
              <div className="aspect-video w-full overflow-hidden bg-muted">
                {asset.kind === "short_video" ? (
                  <video
                    src={asset.url}
                    className="size-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={asset.url}
                    alt={asset.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </div>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{asset.name}</p>
                  <Badge variant="outline" className="capitalize">
                    {asset.kind.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {asset.source} · {formatDate(asset.createdAt)}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete asset"
                    onClick={async () => {
                      await remove({ assetId: asset._id });
                      toast.success("Asset removed");
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add media</DialogTitle>
            <DialogDescription>
              Upload a file or reference a public URL the platforms can fetch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Name</Label>
              <Input
                id="asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Launch hero image"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-kind">Type</Label>
              <select
                id="asset-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="image">Image</option>
                <option value="short_video">Short video</option>
                <option value="story">Story</option>
                <option value="carousel">Carousel</option>
              </select>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {uploading ? "Uploading…" : "Upload a file"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-url">Public URL</Label>
              <Input
                id="asset-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!url}
              onClick={async () => {
                try {
                  await createFromUrl({ name: name || "External asset", url, kind });
                  toast.success("Asset added");
                  setOpen(false);
                  setName("");
                  setUrl("");
                } catch (err) {
                  toast.error("Could not add asset", {
                    description: err instanceof Error ? err.message : "Unknown error",
                  });
                }
              }}
            >
              <Link2 className="size-4" />
              Add URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
