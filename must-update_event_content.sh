#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# tomorrow's date info for RRULE matching
TOMORROW_DATE=$(date -v+1d +%Y%m%d)
TOMORROW_DOW=$(date -v+1d +%A)
TOMORROW_DAY=$(date -v+1d +%-d)
TOMORROW_LABEL=$(date -v+1d +"%A, %d %B %Y")

case $TOMORROW_DOW in
    Monday)    RRULE_DOW="MO" ;; Tuesday)   RRULE_DOW="TU" ;; Wednesday) RRULE_DOW="WE" ;;
    Thursday)  RRULE_DOW="TH" ;; Friday)    RRULE_DOW="FR" ;; Saturday)  RRULE_DOW="SA" ;; Sunday) RRULE_DOW="SU" ;;
esac

# fetch all recurring events from would and could
RAW_EVENTS=$(osascript <<'EOF'
tell application "Calendar"
    set output to ""
    repeat with calName in {"would", "could"}
        try
            set theCal to calendar calName
            repeat with e in (every event of theCal)
                set recur to recurrence of e
                if recur is not "" and recur is not missing value then
                    set eStart to start date of e
                    set eEnd to end date of e
                    try
                        set loc to location of e
                        if loc is missing value then set loc to ""
                    on error
                        set loc to ""
                    end try
                    set output to output & calName & "|" & summary of e & "|" & (eStart as string) & "|" & (eEnd as string) & "|" & loc & "|" & recur & "\n"
                end if
            end repeat
        end try
    end repeat
    return output
end tell
EOF
)

# filter events that occur tomorrow based on RRULE
EVENTS=""
while IFS='|' read calName title startDate endDate location rrule; do
    [[ -z "$rrule" ]] && continue

    # skip expired recurrences
    until_str=$(echo "$rrule" | grep -o 'UNTIL=[0-9]*' | cut -d= -f2 | cut -c1-8)
    [[ -n $until_str && $until_str < $TOMORROW_DATE ]] && continue

    freq=$(echo "$rrule" | grep -o 'FREQ=[A-Z]*' | cut -d= -f2)
    interval=$(echo "$rrule" | grep -o 'INTERVAL=[0-9]*' | cut -d= -f2)
    interval=${interval:-1}
    matched=0

    case $freq in
        DAILY)
            [[ $interval == 1 ]] && matched=1
            ;;
        WEEKLY)
            byday=$(echo "$rrule" | grep -o 'BYDAY=[A-Z,]*' | cut -d= -f2)
            echo "$byday" | grep -q "$RRULE_DOW" && matched=1
            ;;
        MONTHLY)
            byday=$(echo "$rrule" | grep -o 'BYDAY=[^;]*' | cut -d= -f2)
            day=$(echo "$byday" | grep -o '[A-Z][A-Z]')
            weeknum=$(echo "$byday" | grep -o '^[0-9]')
            occurrence=$(( (TOMORROW_DAY + 6) / 7 ))
            [[ $day == $RRULE_DOW && $occurrence == $weeknum ]] && matched=1
            ;;
    esac

    if [[ $matched == 1 ]]; then
        # extract time from original start/end for display
        startTime=$(echo "$startDate" | grep -oi 'at [0-9]*:[0-9]*:[0-9]* [aApP][mM]' | sed 's/at //' | sed 's/:00 / /')
        endTime=$(echo "$endDate" | grep -oi 'at [0-9]*:[0-9]*:[0-9]* [aApP][mM]' | sed 's/at //' | sed 's/:00 / /')
        entry="Calendar: $calName\nTitle: $title\nTime: $startTime – $endTime"
        [[ -n $location ]] && entry="$entry\nLocation: $location"
        EVENTS="$EVENTS$entry\n---\n"
    fi
done <<< "$RAW_EVENTS"

# kill any lingering agent session
pkill -9 -f "session-id must-update_event_content" 2>/dev/null
sleep 2

# clear session cache
setopt NULL_GLOB; rm -f ~/.openclaw/agents/main/sessions/must-update_event_content.jsonl*; unsetopt NULL_GLOB

# run openclaw agent with 120s timeout
/Users/jayagent/.nvm/versions/node/v22.22.0/bin/openclaw agent --session-id must-update_event_content -m "Do not use any tools. Analyze the following calendar events for tomorrow ($TOMORROW_LABEL) from the 'would' and 'could' calendars. Provide:
1. Overview — list all events in order by time
2. Time crashes — identify any overlapping or back-to-back events with no buffer
3. Travel time — flag any events with a location that may need travel time accounted for

Events:
$EVENTS" > /tmp/must-event-raw-output.txt 2>&1 &
OCPID=$!
( sleep 120 && kill -9 $OCPID 2>/dev/null ) &
TIMERPID=$!
wait $OCPID
kill $TIMERPID 2>/dev/null

# save analysis to md file
grep -v "Gateway agent failed" /tmp/must-event-raw-output.txt | grep -v "falling back" | grep -v "gateway closed" | grep -v "loopback" | grep -v "compaction" > /tmp/must-event.md

# send email with md attachment via Mail app
osascript <<EOF
tell application "Mail"
    set newMsg to make new outgoing message with properties {subject:"must-event", visible:false}
    tell newMsg
        make new to recipient with properties {address:"jayreck996@gmail.com"}
        make new cc recipient with properties {address:"jayreck@gmail.com"}
        make new attachment with properties {file name:(POSIX file "/tmp/must-event.md") as alias}
    end tell
    send newMsg
end tell
EOF
