#!/usr/bin/env bash
set -euo pipefail

LOCATION="${LOCATION:-centralindia}"
RG_NAME="${TF_STATE_RG:-tfstate-rg}"
CONTAINER_NAME="tfstate"

az group create --name "$RG_NAME" --location "$LOCATION" --output none

EXISTING_ACCOUNT=$(az storage account list --resource-group "$RG_NAME" --query "[0].name" -o tsv || true)

if [ -n "$EXISTING_ACCOUNT" ]; then
    STORAGE_ACCOUNT_NAME="$EXISTING_ACCOUNT"
else
    STORAGE_ACCOUNT_NAME="tfstate${RANDOM}$(date +%s | tail -c 6)"
    az storage account create \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RG_NAME" \
        --location "$LOCATION" \
        --sku Standard_LRS \
        --encryption-services blob \
        --output none
fi

ACCOUNT_KEY=$(az storage account keys list --resource-group "$RG_NAME" --account-name "$STORAGE_ACCOUNT_NAME" --query '[0].value' -o tsv)

az storage container create \
    --name "$CONTAINER_NAME" \
    --account-name "$STORAGE_ACCOUNT_NAME" \
    --account-key "$ACCOUNT_KEY" \
    --output none || true

echo "terraform init \\"
echo "  -backend-config=\"resource_group_name=$RG_NAME\" \\"
echo "  -backend-config=\"storage_account_name=$STORAGE_ACCOUNT_NAME\" \\"
echo "  -backend-config=\"container_name=$CONTAINER_NAME\" \\"
echo "  -backend-config=\"key=attendx.tfstate\""
