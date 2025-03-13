const LIT_PAYER_SECRET_KEY = process.env.LIT_PAYER_SECRET_KEY;

export async function addPayee(ethAddress: string) {
    if (!LIT_PAYER_SECRET_KEY) {
        throw new Error('LIT_PAYER_SECRET_KEY is not set');
    }

    const headers = {
        "api-key": "test-api-key",
        "payer-secret-key": LIT_PAYER_SECRET_KEY,
        "Content-Type": "application/json",
    };

    const response = await fetch(
        "https://datil-relayer.getlit.dev/add-users",
        {
            method: "POST",
            headers,
            body: JSON.stringify(
                [ethAddress]
            ),
        }
    );

    interface AddUserResponse {
        success: boolean;
        error?: string;
    }

    if (!response.ok) {
        throw new Error(`Error: ${await response.text()}`);
    }
    const data = (await response.json()) as AddUserResponse;
    if (data.success !== true) {
        throw new Error(`Error: ${data.error}`);
    }
}