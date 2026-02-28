import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { google } from "googleapis";

export async function GET() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getServerSession(authOptions) as any;
    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
        const timeMin = new Date().toISOString();
        const timeMax = new Date();
        timeMax.setMonth(timeMax.getMonth() + 1); // 1ヶ月後まで取得

        const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: timeMin,
            timeMax: timeMax.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: "startTime",
        });

        return NextResponse.json({ events: response.data.items || [] });
    } catch (error) {
        console.error("Error fetching calendar events:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getServerSession(authOptions) as any;
    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, description, start, end, reminds } = await req.json();

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
        const event = {
            summary: title,
            description: description,
            start: {
                dateTime: start,
                timeZone: "Asia/Tokyo",
            },
            end: {
                dateTime: end,
                timeZone: "Asia/Tokyo",
            },
            reminders: {
                useDefault: false,
                overrides: reminds || [],
            },
        };

        const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
        });

        return NextResponse.json({ eventId: response.data.id });
    } catch (error) {
        console.error("Error creating calendar event:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getServerSession(authOptions) as any;
    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const eventId = url.searchParams.get("eventId");

    if (!eventId) {
        return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
        await calendar.events.delete({
            calendarId: "primary",
            eventId: eventId,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting calendar event:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getServerSession(authOptions) as any;
    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, title, description, start, end, reminds } = await req.json();

    if (!eventId) {
        return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
        const event = {
            summary: title,
            description: description,
            start: {
                dateTime: start,
                timeZone: "Asia/Tokyo",
            },
            end: {
                dateTime: end,
                timeZone: "Asia/Tokyo",
            },
            reminders: {
                useDefault: false,
                overrides: reminds || [],
            },
        };

        const response = await calendar.events.update({
            calendarId: "primary",
            eventId: eventId,
            requestBody: event,
        });

        return NextResponse.json({ success: true, eventId: response.data.id });
    } catch (error) {
        console.error("Error updating calendar event:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
