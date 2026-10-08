variable "location" {
  type    = string
  default = "centralindia"
}

variable "resource_group" {
  type    = string
  default = "attendx-rg"
}

variable "aks_name" {
  type    = string
  default = "attendx-aks"
}

variable "dns_prefix" {
  type    = string
  default = "attendx-aks"
}

variable "acr_name" {
  type        = string
  description = "Globally unique, 5-50 chars, lowercase alphanumeric only"
}

variable "node_vm_size" {
  type    = string
  default = "Standard_B2s"
}
