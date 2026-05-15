import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/acquisition/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Vote, Clock, Users, AlertTriangle, CheckCircle, XCircle, RotateCcw } from "lucide-react";

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  NOT_STARTED: { label: "NOT STARTED", className: "bg-slate-200 text-slate-700" },
  OPEN: { label: "OPEN", className: "bg-blue-500 text-white" },
  CLOSED: { label: "CLOSED", className: "bg-slate-500 text-white" },
  REOPENED: { label: "REOPENED", className: "bg-amber-500 text-white" },
};

const OUTCOME_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600" },
  NO_QUORUM: { label: "No Quorum", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700" },
  CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-purple-100 text-purple-700" },
};

export function VotePanel({ dealId }: { dealId: string }) {
  const { can: canDo } = useRole();
  const utils = trpc.useUtils();
  const { data: vote, isLoading } = trpc.votes.getForDeal.useQuery({ dealId });

  const [rationale, setRationale] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenForm, setShowReopenForm] = useState(false);

  const openVote = trpc.votes.open.useMutation({
    onSuccess: () => utils.votes.getForDeal.invalidate({ dealId }),
  });
  const castBallot = trpc.votes.castBallot.useMutation({
    onSuccess: () => {
      utils.votes.getForDeal.invalidate({ dealId });
      setRationale("");
    },
  });
  const closeVote = trpc.votes.close.useMutation({
    onSuccess: () => utils.votes.getForDeal.invalidate({ dealId }),
  });
  const reopenVote = trpc.votes.reopen.useMutation({
    onSuccess: () => {
      utils.votes.getForDeal.invalidate({ dealId });
      setReopenReason("");
      setShowReopenForm(false);
    },
  });

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading vote...</CardContent></Card>;
  }

  // No vote exists yet
  if (!vote) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            IC Vote
          </CardTitle>
          <CardDescription>No vote opened on this deal yet.</CardDescription>
        </CardHeader>
        <CardContent>
          {canDo("vote.open") ? (
            <div className="space-y-3">
              <Button
                onClick={() => openVote.mutate({ dealId, deadlineHours: 72 })}
                disabled={openVote.isPending}
              >
                {openVote.isPending ? "Opening..." : "Open IC Vote (72h deadline)"}
              </Button>
              {openVote.error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Cannot open vote</div>
                      <div className="text-xs mt-1">{openVote.error.message}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Only Partners can open an IC vote.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const stateBadge = STATE_BADGE[vote.state] ?? STATE_BADGE.NOT_STARTED;
  const outcomeBadge = OUTCOME_BADGE[vote.outcome ?? "PENDING"] ?? OUTCOME_BADGE.PENDING;
  const isActive = vote.state === "OPEN" || vote.state === "REOPENED";
  const myBallot = vote.ballots?.find((b: any) => b.voterOpenId);
  const deadline = vote.deadlineAt ? new Date(vote.deadlineAt) : null;
  const hoursLeft = deadline ? Math.max(0, Math.round((deadline.getTime() - Date.now()) / 3_600_000)) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            IC Vote
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
            <Badge className={outcomeBadge.className}>{outcomeBadge.label}</Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-4 mt-2">
          {isActive && deadline && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {hoursLeft}h until deadline
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {vote.ballots?.length ?? 0} ballot(s) cast
          </span>
          {(vote.reopenCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reopened {vote.reopenCount}x
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Cast ballot UI - only when vote is active */}
        {isActive && canDo("ballot.cast") && (
          <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
            <div className="text-sm font-medium">Your ballot</div>
            <Textarea
              placeholder="Rationale (optional)"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              maxLength={500}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => castBallot.mutate({ voteId: vote.id, choice: "APPROVE", rationale: rationale || undefined })}
                disabled={castBallot.isPending}
              >
                <CheckCircle className="h-3 w-3 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => castBallot.mutate({ voteId: vote.id, choice: "REJECT", rationale: rationale || undefined })}
                disabled={castBallot.isPending}
              >
                <XCircle className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-300 text-purple-700"
                onClick={() => castBallot.mutate({ voteId: vote.id, choice: "REQUEST_CHANGES", rationale: rationale || undefined })}
                disabled={castBallot.isPending}
              >
                Request Changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => castBallot.mutate({ voteId: vote.id, choice: "ABSTAIN", rationale: rationale || undefined })}
                disabled={castBallot.isPending}
              >
                Abstain
              </Button>
            </div>
            {castBallot.error && (
              <div className="text-xs text-red-700">{castBallot.error.message}</div>
            )}
          </div>
        )}

        {/* Ballot board */}
        {vote.ballots && vote.ballots.length > 0 && (
          <div className="border rounded-lg divide-y">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-slate-50">Ballots cast</div>
            {vote.ballots.map((b: any) => (
              <div key={b.id} className="px-3 py-2 text-sm flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{b.voterName ?? b.voterOpenId}</div>
                  {b.rationale && <div className="text-xs text-muted-foreground mt-0.5">{b.rationale}</div>}
                </div>
                <Badge
                  variant="outline"
                  className={
                    b.choice === "APPROVE" ? "border-emerald-300 text-emerald-700" :
                    b.choice === "REJECT" ? "border-red-300 text-red-700" :
                    b.choice === "REQUEST_CHANGES" ? "border-purple-300 text-purple-700" :
                    "border-slate-300 text-slate-600"
                  }
                >
                  {b.choice}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Partner controls: close + reopen */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {isActive && canDo("vote.close") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeVote.mutate({ voteId: vote.id })}
              disabled={closeVote.isPending}
            >
              Close vote
            </Button>
          )}
          {vote.state === "CLOSED" && canDo("vote.reopen") && !showReopenForm && (
            <Button size="sm" variant="outline" onClick={() => setShowReopenForm(true)}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reopen vote
            </Button>
          )}
          {showReopenForm && (
            <div className="w-full space-y-2">
              <Textarea
                placeholder="Reason for reopening (10-500 chars, required)"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => reopenVote.mutate({ voteId: vote.id, reason: reopenReason })}
                  disabled={reopenReason.length < 10 || reopenVote.isPending}
                >
                  Confirm reopen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowReopenForm(false); setReopenReason(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {vote.reopenReason && vote.state === "REOPENED" && (
          <div className="text-xs italic text-muted-foreground border-l-2 border-amber-400 pl-3">
            Reopen reason: {vote.reopenReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
