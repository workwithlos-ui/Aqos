import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/lib/acquisition/useRole";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Comment = {
  id: number;
  dealId: string;
  authorOpenId: string;
  body: string;
  resolvedAt: string | null;
  resolvedByOpenId: string | null;
  isBlocker?: boolean;
  deletedAt: string | null;
  createdAt: string | undefined;
  updatedAt: string | undefined;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function CommentItem({
  comment,
  currentUserOpenId,
  onChange,
}: {
  comment: Comment;
  currentUserOpenId: string;
  onChange: () => void;
}) {
  const { isPartner, can } = useRole();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);

  const editComment = trpc.comments.editOwn.useMutation({
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const deleteOwn = trpc.comments.deleteOwn.useMutation({ onSuccess: onChange });
  const deleteAny = trpc.comments.deleteAny.useMutation({ onSuccess: onChange });
  const resolve = trpc.comments.resolve.useMutation({ onSuccess: onChange });
  const unresolve = trpc.comments.unresolve.useMutation({ onSuccess: onChange });
  const setBlocker = trpc.comments.setBlocker.useMutation({ onSuccess: onChange });

  const isOwn = comment.authorOpenId === currentUserOpenId;
  const isDeleted = comment.deletedAt !== null;
  const isResolved = comment.resolvedAt !== null;
  const isBlocker = !!comment.isBlocker;
  const createdMs = comment.createdAt ? new Date(comment.createdAt).getTime() : 0;
  const editWindowOpen = isOwn && Date.now() - createdMs < EDIT_WINDOW_MS && !isDeleted;

  if (isDeleted) {
    return (
      <div className="border border-dashed rounded-lg p-4 text-sm text-muted-foreground italic">
        [deleted comment by {comment.authorOpenId.slice(0, 12)}…] · {relativeTime(comment.createdAt)}
      </div>
    );
  }

  return (
    <div
      className={`border rounded-lg p-4 space-y-2 transition-colors ${
        isBlocker && !isResolved
          ? "border-red-300 bg-red-50/50"
          : isResolved
          ? "border-emerald-200 bg-emerald-50/30"
          : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{comment.authorOpenId.slice(0, 12)}…</span>
          <span className="text-muted-foreground text-xs">{relativeTime(comment.createdAt)}</span>
          {isBlocker && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-600 text-white">
              ● Blocker
            </span>
          )}
          {isResolved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
              ✓ Resolved by {comment.resolvedByOpenId?.slice(0, 10)}…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {can("comment.set_blocker") && (
            <button
              type="button"
              onClick={() => setBlocker.mutate({ commentId: comment.id, isBlocker: !isBlocker })}
              disabled={setBlocker.isPending}
              className={`text-xs px-2 py-1 rounded border ${
                isBlocker
                  ? "border-red-400 bg-red-100 text-red-700 hover:bg-red-200"
                  : "border-border hover:bg-accent"
              }`}
            >
              {isBlocker ? "Unflag" : "Flag blocker"}
            </button>
          )}
          {can("comment.resolve") && (
            <button
              type="button"
              onClick={() =>
                isResolved
                  ? unresolve.mutate({ commentId: comment.id })
                  : resolve.mutate({ commentId: comment.id })
              }
              disabled={resolve.isPending || unresolve.isPending}
              className="text-xs px-2 py-1 rounded border hover:bg-accent"
            >
              {isResolved ? "Unresolve" : "Resolve"}
            </button>
          )}
          {editWindowOpen && can("comment.edit_own") && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 rounded border hover:bg-accent"
            >
              Edit
            </button>
          )}
          {isOwn && can("comment.delete_own") && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this comment? It will be soft-deleted but visible in audit.")) {
                  deleteOwn.mutate({ commentId: comment.id });
                }
              }}
              className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {!isOwn && isPartner && can("comment.delete_any") && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this comment as Partner? Soft delete preserves audit trail.")) {
                  deleteAny.mutate({ commentId: comment.id });
                }
              }}
              className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            >
              Delete (Partner)
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full min-h-[80px] p-2 text-sm border rounded font-mono"
            placeholder="Edit comment (markdown supported)"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditBody(comment.body);
              }}
              className="text-xs px-3 py-1 rounded border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => editComment.mutate({ commentId: comment.id, body: editBody })}
              disabled={editComment.isPending || editBody.trim().length === 0}
              className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground"
            >
              Save
            </button>
          </div>
          {editComment.error && (
            <div className="text-xs text-red-600">{editComment.error.message}</div>
          )}
        </div>
      ) : (
        <div className="prose prose-sm max-w-none break-words">
          <ReactMarkdown
            components={{
              p: ({ children }: { children?: React.ReactNode }) => <p className="my-1 leading-relaxed text-sm">{children}</p>,
              code: ({ children }: { children?: React.ReactNode }) => (
                <code className="px-1 py-0.5 rounded bg-muted text-xs">{children}</code>
              ),
            }}
          >
            {comment.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function CommentThread({ dealId }: { dealId: string }) {
  const { user } = useAuth();
  const { can, isObserver } = useRole();
  const utils = trpc.useUtils();

  const commentsQuery = trpc.comments.listForDeal.useQuery({ dealId });
  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      setNewBody("");
      utils.comments.listForDeal.invalidate({ dealId });
    },
  });

  const [newBody, setNewBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);

  // For now, mentionable users are hardcoded to the current user (org members API not built yet).
  // Backend filters Observer out of mention notifications.
  const mentionableUsers = useMemo(() => {
    const list: { openId: string; name: string }[] = [];
    if (user) list.push({ openId: user.openId, name: (user as any).name ?? user.openId.slice(0, 12) });
    return list;
  }, [user]);

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setNewBody(value);

    // detect @mention trigger
    const before = value.slice(0, cursorPos);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionStart(cursorPos - atMatch[0].length);
      setMentionQuery(atMatch[1]);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  }

  function selectMention(user: { openId: string; name: string }) {
    if (mentionStart < 0) return;
    const before = newBody.slice(0, mentionStart);
    const after = newBody.slice(mentionStart + (mentionQuery?.length ?? 0) + 1);
    const inserted = `@${user.openId} `;
    setNewBody(before + inserted + after);
    setMentionQuery(null);
    setMentionStart(-1);
    textareaRef.current?.focus();
  }

  const filteredMentions = mentionQuery
    ? mentionableUsers.filter((m) =>
        (m.name + m.openId).toLowerCase().includes(mentionQuery.toLowerCase()),
      )
    : [];

  const refresh = () => utils.comments.listForDeal.invalidate({ dealId });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Comments</h3>
        <span className="text-xs text-muted-foreground">
          {commentsQuery.data?.length ?? 0} comment{commentsQuery.data?.length === 1 ? "" : "s"}
        </span>
      </div>

      {can("comment.create") && (
        <div className="border rounded-lg p-3 space-y-2 bg-card relative">
          <textarea
            ref={textareaRef}
            value={newBody}
            onChange={handleBodyChange}
            placeholder="Add a comment. Markdown supported. Type @ to mention a teammate."
            className="w-full min-h-[80px] p-2 text-sm border rounded font-mono resize-none"
          />
          {filteredMentions.length > 0 && mentionQuery !== null && (
            <div className="absolute z-10 left-3 top-full mt-1 bg-popover border rounded shadow-lg max-h-40 overflow-y-auto">
              {filteredMentions.map((m) => (
                <button
                  type="button"
                  key={m.openId}
                  onClick={() => selectMention(m)}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-muted-foreground">{m.openId.slice(0, 12)}…</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">
              Edit window: 15 minutes after posting · Soft delete only
            </span>
            <button
              type="button"
              onClick={() => createComment.mutate({ dealId, body: newBody })}
              disabled={createComment.isPending || newBody.trim().length === 0}
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              {createComment.isPending ? "Posting…" : "Post"}
            </button>
          </div>
          {createComment.error && (
            <div className="text-xs text-red-600">{createComment.error.message}</div>
          )}
        </div>
      )}

      {isObserver && (
        <div className="text-xs text-muted-foreground italic px-3 py-2 border border-dashed rounded">
          You have read-only access. Observer cannot create, edit, resolve, or delete comments.
        </div>
      )}

      {commentsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading comments…</div>
      ) : commentsQuery.data && commentsQuery.data.length > 0 ? (
        <div className="space-y-3">
          {commentsQuery.data.map((c) => (
            <CommentItem
              key={c.id}
              comment={c as Comment}
              currentUserOpenId={user?.openId ?? ""}
              onChange={refresh}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">No comments yet.</div>
      )}
    </div>
  );
}
